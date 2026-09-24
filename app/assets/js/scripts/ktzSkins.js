;(() => {
    const { createSkinManager, validateSkinPNG, MAX_PNG_BYTES, SkinError } = require('./assets/js/skinmanager')
    const { drawSkin, drawCape } = require('./assets/js/skinpreview')
    const strings = require('./assets/js/skinstrings')
    const locale = typeof ktzGetLanguage === 'function' ? ktzGetLanguage() : 'ko_KR'
    const t = key => (strings[locale] || strings.ko_KR)[key] || strings.ko_KR[key] || strings.ko_KR.unknown
    const el = id => document.getElementById(id)
    const gameBusy = () => window.ktzLaunchState != null && window.ktzLaunchState !== 'idle'
    const service = createSkinManager({ getAccount: () => ConfigManager.getSelectedAccount(), validateAccount: () => AuthManager.validateSelected(), isGameBusy: gameBusy })
    let profile = null, currentImage = null, pending = null, chosenCape = null, operation = null
    let working = false, generation = 0, showingBack = false, owner = null
    const textureCache = new Map()

    function status(message, error = false){
        el('ktzSkinStatus').textContent = message
        el('ktzSkinStatus').dataset.error = String(error)
    }
    function variant(){ return document.querySelector('input[name="ktzSkinVariant"]:checked').value }
    function activeCape(){ return profile?.capes.find(c => c.active)?.id || null }
    function controls(){
        const disabled = working || gameBusy() || !profile || ConfigManager.getSelectedAccount()?.uuid !== owner
        for(const id of ['ktzSkinChoose', 'ktzSkinReset', 'ktzSkinApply', 'ktzSkinModel', 'ktzSkinFile']) el(id).disabled = disabled
        el('ktzSkinRefresh').disabled = working
        el('ktzSkinApplyCape').disabled = disabled || chosenCape === activeCape()
        el('ktzSkinApply').disabled = disabled || !pending
        el('ktzSkinDiscard').disabled = working
        el('ktzSkinConfirmApply').disabled = disabled || !operation
        el('ktzSkinsContainer').setAttribute('aria-busy', String(working))
        for(const button of el('ktzSkinCapes').querySelectorAll('button')) button.disabled = disabled
    }
    function redraw(){
        const skin = profile?.skins.find(s => s.active) || profile?.skins[0]
        drawSkin(el('ktzSkinCurrentCanvas'), currentImage, skin?.variant, showingBack)
        el('ktzSkinNoPreview').hidden = !!currentImage
        el('ktzSkinCurrentCanvas').hidden = !currentImage
        if(pending) drawSkin(el('ktzSkinPendingCanvas'), pending.image, variant(), showingBack)
        el('ktzSkinFront').setAttribute('aria-pressed', String(!showingBack))
        el('ktzSkinBack').setAttribute('aria-pressed', String(showingBack))
    }
    function discard(){
        pending = null
        el('ktzSkinFile').value = ''
        el('ktzSkinUploadPreview').hidden = true
        el('ktzSkinFileName').textContent = ''
        drawSkin(el('ktzSkinPendingCanvas'), null)
        controls()
    }
    function clear(){
        generation++
        profile = null; currentImage = null; chosenCape = null; operation = null; owner = null
        working = false
        textureCache.clear()
        if(el('ktzSkinConfirm').open) el('ktzSkinConfirm').close()
        discard()
        el('ktzSkinPlayerName').textContent = '—'
        el('ktzSkinCurrentVariant').textContent = '—'
        el('ktzSkinCurrentCape').textContent = '—'
        el('ktzSkinCapes').replaceChildren()
        el('ktzSkinCapeCount').textContent = ''
        el('ktzSkinNoCapes').hidden = true
        status('')
        redraw()
    }
    async function imageFrom(url){
        if(!url) return null
        if(textureCache.has(url)) return textureCache.get(url)
        const src = await service.texture(url)
        const image = await loadImage(src)
        textureCache.set(url, image)
        return image
    }
    function loadImage(src){
        return new Promise((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => reject(new SkinError('INVALID_PNG'))
            image.src = src
        })
    }
    async function renderProfile(value, ticket){
        profile = value
        chosenCape = activeCape()
        const skin = profile.skins.find(s => s.active) || profile.skins[0]
        el('ktzSkinPlayerName').textContent = profile.name
        el('ktzSkinCurrentVariant').textContent = skin ? t(skin.variant === 'slim' ? 'slimHint' : 'classicHint') : t('defaultSkin')
        el('ktzSkinCurrentCape').textContent = `${t('capes')} · ${profile.capes.find(c => c.active)?.alias || t('noCape')}`
        if(!pending) document.querySelector(`input[name="ktzSkinVariant"][value="${skin?.variant || 'classic'}"]`).checked = true
        const list = el('ktzSkinCapes')
        list.replaceChildren()
        el('ktzSkinCapeCount').textContent = String(profile.capes.length)
        el('ktzSkinNoCapes').hidden = profile.capes.length !== 0
        const downloads = []
        for(const cape of [{ id: null, alias: t('noCape'), url: null }, ...profile.capes]){
            const button = document.createElement('button')
            button.className = 'ktzCapeCard'
            button.dataset.capeId = cape.id || ''
            button.setAttribute('aria-pressed', String(chosenCape === cape.id))
            const canvas = document.createElement('canvas')
            canvas.width = 60; canvas.height = 96
            canvas.setAttribute('aria-hidden', 'true')
            if(cape.id === null){
                const empty = document.createElement('span')
                empty.className = 'ktzNoCapeIcon'; empty.textContent = '—'
                button.append(empty)
            } else {
                button.append(canvas)
                downloads.push(imageFrom(cape.url).then(image => { if(ticket === generation) drawCape(canvas, image) }).catch(() => {}))
            }
            const label = document.createElement('span')
            label.textContent = cape.alias
            button.append(label)
            if(cape.id === activeCape()){
                const badge = document.createElement('small')
                badge.textContent = t('worn'); button.append(badge)
            }
            button.onclick = () => {
                if(working || gameBusy() || ConfigManager.getSelectedAccount()?.uuid !== owner) return
                chosenCape = cape.id
                for(const card of list.children) card.setAttribute('aria-pressed', String((card.dataset.capeId || null) === chosenCape))
                controls()
            }
            list.append(button)
        }
        currentImage = null
        downloads.push(imageFrom(skin?.url).then(image => { if(ticket === generation) currentImage = image }).catch(() => {}))
        await Promise.all(downloads)
        if(ticket === generation) redraw()
    }
    async function refresh(){
        if(working) return false
        const account = ConfigManager.getSelectedAccount()
        if(!account || account.type !== 'microsoft'){
            clear(); status(t('LOGIN_REQUIRED'), true); return false
        }
        if(owner !== account.uuid) clear()
        owner = account.uuid
        const ticket = ++generation
        working = true; controls(); status(t('loading'))
        try {
            const value = await service.getProfile(owner)
            if(ticket !== generation || ConfigManager.getSelectedAccount()?.uuid !== value.id) return false
            await renderProfile(value, ticket)
            if(ticket !== generation) return false
            status(t('ready'))
            return true
        } catch(err) {
            if(ticket === generation){ profile = null; status(t(err.code || 'unknown'), true) }
            return false
        } finally { if(ticket === generation){ working = false; controls() } }
    }
    async function chooseFile(file){
        if(!file || working || gameBusy() || !profile) return
        discard()
        const ticket = generation, uuid = owner
        try {
            if(file.size > MAX_PNG_BYTES) throw new SkinError('FILE_TOO_LARGE')
            const buffer = Buffer.from(await file.arrayBuffer())
            validateSkinPNG(buffer)
            const image = await loadImage(`data:image/png;base64,${buffer.toString('base64')}`)
            if(ticket !== generation || ConfigManager.getSelectedAccount()?.uuid !== uuid) return
            pending = { buffer, image, name: file.name.slice(0, 120) }
            el('ktzSkinFileName').textContent = pending.name
            el('ktzSkinUploadPreview').hidden = false
            redraw(); controls(); status(t('previewOnly'))
            el('ktzSkinUploadPreview').scrollIntoView({ block: 'nearest' })
        } catch(err) { if(ticket === generation) status(t(err.code || 'INVALID_PNG'), true) }
    }
    function ask(kind){
        if(working || !profile || ConfigManager.getSelectedAccount()?.uuid !== owner) return
        if(gameBusy()) return status(t('GAME_RUNNING'), true)
        if(kind === 'upload' && !pending) return
        if(kind === 'cape' && chosenCape === activeCape()) return
        operation = { kind, uuid: owner, variant: variant(), file: pending, cape: chosenCape }
        const detail = kind === 'upload' ? `${pending.name} · ${t(variant())}` : kind === 'reset' ? t('reset') : `${t('capes')} · ${profile.capes.find(c => c.id === chosenCape)?.alias || t('noCape')}`
        el('ktzSkinConfirmDetail').textContent = `${profile.name} — ${detail}`
        el('ktzSkinConfirm').showModal()
        controls()
    }
    async function apply(){
        const action = operation
        if(!action || working) return
        operation = null
        el('ktzSkinConfirm').close()
        if(ConfigManager.getSelectedAccount()?.uuid !== action.uuid) return status(t('ACCOUNT_CHANGED'), true)
        if(gameBusy()) return status(t('GAME_RUNNING'), true)
        const ticket = generation
        working = true; controls(); status(t('saving'))
        try {
            if(action.kind === 'upload') await service.upload(action.uuid, action.file.buffer, action.variant)
            else if(action.kind === 'reset') await service.reset(action.uuid)
            else await service.setCape(action.uuid, action.cape)
            if(ticket !== generation) return
            discard()
            textureCache.clear()
            working = false
            const fresh = await refresh()
            if(ConfigManager.getSelectedAccount()?.uuid !== action.uuid) return
            status(t(fresh ? 'success' : 'changedRefreshFailed'), !fresh)
            document.dispatchEvent(new CustomEvent('ktz:skin-changed'))
        } catch(err) {
            if(ticket === generation) status(t(err.code || 'unknown'), true)
        } finally {
            if(ConfigManager.getSelectedAccount()?.uuid === action.uuid){ working = false; controls() }
        }
    }

    document.querySelectorAll('[data-skin-text]').forEach(node => { node.textContent = t(node.dataset.skinText) })
    el('ktzSkinCapes').setAttribute('aria-label', t('capes'))
    el('ktzSkinCurrentCanvas').setAttribute('aria-label', t('current'))
    el('ktzSkinPendingCanvas').setAttribute('aria-label', t('previewOnly'))
    el('ktzSkinRefresh').onclick = refresh
    el('ktzSkinChoose').onclick = () => el('ktzSkinFile').click()
    el('ktzSkinFile').onchange = () => chooseFile(el('ktzSkinFile').files[0])
    el('ktzSkinDiscard').onclick = discard
    el('ktzSkinApply').onclick = () => ask('upload')
    el('ktzSkinReset').onclick = () => ask('reset')
    el('ktzSkinApplyCape').onclick = () => ask('cape')
    el('ktzSkinConfirmApply').onclick = apply
    el('ktzSkinConfirmCancel').onclick = () => { operation = null; el('ktzSkinConfirm').close() }
    el('ktzSkinConfirm').addEventListener('cancel', () => { operation = null })
    el('ktzSkinModel').onchange = redraw
    el('ktzSkinFront').onclick = () => { showingBack = false; redraw() }
    el('ktzSkinBack').onclick = () => { showingBack = true; redraw() }
    document.addEventListener('ktz:view-changed', event => {
        if(event.detail.view === VIEWS.skins && !profile) refresh()
    })
    document.addEventListener('ktz:account-changed', () => {
        clear()
        if(getCurrentView() === VIEWS.skins) refresh()
    })
    document.addEventListener('ktz:launch-state', () => {
        if(gameBusy() && el('ktzSkinConfirm').open){ operation = null; el('ktzSkinConfirm').close() }
        controls()
    })
    clear()
})()
