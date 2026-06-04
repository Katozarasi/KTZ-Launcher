// KTZ patch: open the full-screen KTZ server select view from the existing landing server label.
// This keeps the original launch flow intact and only changes the server-change entry point.

function ktzLandingLanguage(){
    try {
        const fs = require('fs-extra')
        const path = require('path')
        const configPath = path.join(ConfigManager.getLauncherDirectory(), 'config.json')
        if(fs.existsSync(configPath)){
            const config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            return config?.settings?.launcher?.language || 'ko_KR'
        }
    } catch(_err) {}
    return 'ko_KR'
}

function ktzLandingText(key){
    const lang = ktzLandingLanguage()
    const text = {
        ko_KR: {
            serverSelect: '서버 선택하기',
            serverSelectTitle: '서버 선택 화면 열기',
            globalNews: '전체공지',
            maintenanceTitle: '서버 점검 중',
            maintenanceMessage: '현재 선택한 서버는 점검 중입니다. 공지사항을 확인해 주세요.'
        },
        ja_JP: {
            serverSelect: 'サーバー選択',
            serverSelectTitle: 'サーバー選択画面を開く',
            globalNews: '全体お知らせ',
            maintenanceTitle: 'サーバーメンテナンス中',
            maintenanceMessage: '現在選択中のサーバーはメンテナンス中です。お知らせをご確認ください。'
        },
        en_US: {
            serverSelect: 'Select Server',
            serverSelectTitle: 'Open server selection screen',
            globalNews: 'Global',
            maintenanceTitle: 'Server Under Maintenance',
            maintenanceMessage: 'The selected server is currently under maintenance. Please check the news.'
        }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzLocalizedServerName(rawServer){
    const lang = ktzLandingLanguage()
    const names = {
        ko_KR: {
            kato_empire_official: '카토제국 공식서버',
            kato_empire_test: '카토제국 테스트 서버',
            city_ability: '도시능력자'
        },
        ja_JP: {
            kato_empire_official: 'カト帝国 公式サーバー',
            kato_empire_test: 'カト帝国 テストサーバー',
            city_ability: '都市能力者'
        },
        en_US: {
            kato_empire_official: 'Kato Empire Official',
            kato_empire_test: 'Kato Empire Test',
            city_ability: 'City Ability'
        }
    }
    return names[lang]?.[rawServer.id] || names.ko_KR[rawServer.id] || rawServer.ktz?.shortName || rawServer.name || rawServer.id
}

function ktzIsServerInMaintenance(rawServer){
    const maintenance = rawServer?.ktz?.maintenance
    return maintenance === true || maintenance?.enabled === true
}

function ktzMaintenanceMessage(rawServer){
    const lang = ktzLandingLanguage()
    const meta = rawServer?.ktz || {}
    const maintenance = meta.maintenance

    return meta.i18n?.[lang]?.maintenanceMessage
        || meta.maintenanceMessages?.[lang]
        || maintenance?.i18n?.[lang]
        || maintenance?.message
        || meta.maintenanceMessage
        || ktzLandingText('maintenanceMessage')
}

async function ktzGetSelectedDistroServer(){
    const distro = await DistroAPI.getDistribution()
    return distro.getServerById(ConfigManager.getSelectedServer()) || distro.getMainServer()
}

async function ktzApplyLandingBackground(){
    try {
        const server = await ktzGetSelectedDistroServer()

        if(server == null){
            return
        }

        const meta = server.rawServer.ktz || {}
        const background = meta.landingBackground || meta.background || server.rawServer.icon

        if(background != null){
            document.body.style.backgroundImage = `url('${background}')`
            document.body.style.backgroundSize = 'cover'
            document.body.style.backgroundPosition = 'center center'
        }
    } catch(err) {
        console.error('Unable to apply KTZ landing background.', err)
    }
}

function ktzBindLandingServerSelectButton(){
    const button = document.getElementById('server_selection_button')
    if(button == null){
        return
    }

    button.innerHTML = ktzLandingText('serverSelect')
    button.title = ktzLandingText('serverSelectTitle')
    button.onclick = async e => {
        e.target.blur()
        await ktzShowServerSelect(VIEWS.landing)
    }
}

function ktzBindMaintenanceLaunchGuard(){
    const launchButton = document.getElementById('launch_button')
    if(launchButton == null || launchButton.hasAttribute('ktz-maintenance-guard')){
        return
    }

    launchButton.setAttribute('ktz-maintenance-guard', '')
    launchButton.addEventListener('click', async e => {
        try {
            const server = await ktzGetSelectedDistroServer()
            if(server != null && ktzIsServerInMaintenance(server.rawServer)){
                e.preventDefault()
                e.stopImmediatePropagation()
                const title = ktzLandingText('maintenanceTitle')
                const message = ktzMaintenanceMessage(server.rawServer)
                if(typeof showLaunchFailure === 'function'){
                    showLaunchFailure(title, message)
                } else {
                    alert(`${title}\n${message}`)
                }
            }
        } catch(err) {
            console.error('Unable to check KTZ server maintenance state.', err)
        }
    }, true)
}

function ktzPatchManagedModCleanup(){
    try {
        const fs = require('fs-extra')
        const path = require('path')
        const KtzProcessBuilder = require('./assets/js/processbuilder')
        const { Type } = require('helios-distribution-types')

        if(KtzProcessBuilder.prototype.ktzManagedModCleanupPatched){
            return
        }

        KtzProcessBuilder.prototype.ktzManagedModCleanupPatched = true
        const originalBuild = KtzProcessBuilder.prototype.build

        function collectKtzManagedModPaths(modules, keepSet){
            for(const module of modules || []){
                const raw = module.rawModule || {}
                const type = raw.type
                if((type === Type.ForgeMod || type === Type.FabricMod || type === Type.LiteMod) && String(raw.id || '').startsWith('ktz.')){
                    try {
                        keepSet.add(path.resolve(module.getPath()).toLowerCase())
                    } catch(_err) {}
                }
                if(module.subModules?.length > 0){
                    collectKtzManagedModPaths(module.subModules, keepSet)
                }
            }
        }

        function removeEmptyDirs(dir, root){
            if(!fs.existsSync(dir) || path.resolve(dir) === path.resolve(root)){
                return
            }
            try {
                const entries = fs.readdirSync(dir)
                if(entries.length === 0){
                    fs.rmdirSync(dir)
                    removeEmptyDirs(path.dirname(dir), root)
                }
            } catch(_err) {}
        }

        function cleanupRoot(root, keepSet){
            if(!fs.existsSync(root)){
                return
            }
            const files = []
            function walk(dir){
                for(const entry of fs.readdirSync(dir)){
                    const full = path.join(dir, entry)
                    const stat = fs.statSync(full)
                    if(stat.isDirectory()){
                        walk(full)
                    } else {
                        files.push(full)
                    }
                }
            }
            walk(root)
            for(const file of files){
                const normalized = path.resolve(file).toLowerCase()
                if(!keepSet.has(normalized)){
                    fs.removeSync(file)
                    console.log('[KTZ Mod Sync] Removed stale managed mod:', file)
                    removeEmptyDirs(path.dirname(file), root)
                }
            }
        }

        KtzProcessBuilder.prototype.ktzCleanupManagedMods = function(){
            const keepSet = new Set()
            collectKtzManagedModPaths(this.server.modules, keepSet)
            cleanupRoot(path.join(this.commonDir, 'modstore', 'ktz'), keepSet)
            cleanupRoot(path.join(this.commonDir, 'mods', 'fabric', 'ktz'), keepSet)
        }

        KtzProcessBuilder.prototype.build = function(...args){
            this.ktzCleanupManagedMods()
            return originalBuild.apply(this, args)
        }
    } catch(err) {
        console.error('Unable to patch KTZ managed mod cleanup.', err)
    }
}

setTimeout(() => {
    ktzBindLandingServerSelectButton()
    ktzBindMaintenanceLaunchGuard()
    ktzPatchManagedModCleanup()
    ktzApplyLandingBackground()
}, 0)

// The original launcher updates this button text whenever the selected server changes.
// Keep the KTZ label stable and keep the landing background synced.
setInterval(() => {
    ktzBindLandingServerSelectButton()
    ktzBindMaintenanceLaunchGuard()
    if(getCurrentView() === VIEWS.landing){
        ktzApplyLandingBackground()
    }
}, 1000)

async function ktzFetchNewsFeed(newsFeed, label){
    if(!newsFeed){
        return []
    }

    return await new Promise((resolve) => {
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                    const el = $(items[i])
                    const rawDate = el.find('pubDate').text()
                    const parsedDate = new Date(rawDate)
                    const date = parsedDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', minute: 'numeric'})

                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    let content = el.find('content\\:encoded').text() || el.find('description').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text() || label || 'KTZ'

                    if(label){
                        title = `[${label}] ${title}`
                    }

                    articles.push({
                        link,
                        title,
                        date,
                        rawDate: parsedDate.getTime(),
                        author,
                        content,
                        comments,
                        commentsLink: link + '#comments'
                    })
                }

                resolve(articles)
            },
            timeout: 2500
        }).catch(() => {
            resolve([])
        })
    })
}

// Override original loadNews(): NEWS displays global news plus selected-server news.
loadNews = async function(){
    const distroData = await DistroAPI.getDistribution()
    const selectedServer = distroData.getServerById(ConfigManager.getSelectedServer()) || distroData.getMainServer()
    const globalNews = distroData.rawDistribution.ktz?.globalNews || distroData.rawDistribution.rss
    const serverNews = selectedServer?.rawServer?.ktz?.news
    const serverName = selectedServer?.rawServer != null ? ktzLocalizedServerName(selectedServer.rawServer) : null

    const globalArticles = await ktzFetchNewsFeed(globalNews, ktzLandingText('globalNews'))
    const serverArticles = await ktzFetchNewsFeed(serverNews, serverName)
    const articles = [...globalArticles, ...serverArticles]

    articles.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0))

    return { articles }
}
