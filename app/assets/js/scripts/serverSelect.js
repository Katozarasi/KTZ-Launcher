/**
 * Script for serverSelect.ejs
 * Adds a full-screen server selection step while keeping the existing launch flow intact.
 */

const KTZ_SERVER_SELECT_VIEW = '#serverSelectContainer'
const ktzServerSelectBack = document.getElementById('ktzServerSelectBack')
const ktzServerList = document.getElementById('ktzServerList')
const ktzServerPreviewImage = document.getElementById('ktzServerPreviewImage')
const ktzServerPreviewName = document.getElementById('ktzServerPreviewName')
const ktzServerPreviewDesc = document.getElementById('ktzServerPreviewDesc')
const ktzServerPreviewVersion = document.getElementById('ktzServerPreviewVersion')
const ktzServerPreviewAddress = document.getElementById('ktzServerPreviewAddress')
const ktzServerSelectConfirm = document.getElementById('ktzServerSelectConfirm')
const KTZ_SERVER_SELECT_VISIBLE_IDS = new Set(['astervale'])

let ktzSelectedServerId = null
let ktzServerSelectShownThisSession = false
let ktzServerSelectPreviousView = VIEWS.landing

function ktzServerSelectLanguage(){
    try {
        const fs = require('fs-extra')
        const path = require('path')
        const configPath = path.join(ConfigManager.getLauncherDirectory(), 'config.json')
        if(fs.existsSync(configPath)){
            const config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            return config?.settings?.launcher?.language || 'ko_KR'
        }
    } catch(_err) {
        // Fall back to Korean when the configured locale is unavailable.
    }
    return 'ko_KR'
}

function ktzServerSelectText(key){
    const lang = ktzServerSelectLanguage()
    const text = {
        ko_KR: {
            back: '← 뒤로가기',
            backTitle: '뒤로가기',
            subtitle: '서버를 선택하세요',
            previewName: '서버 선택',
            previewDesc: '접속할 서버를 선택하면 상세 정보가 표시됩니다.',
            confirm: '선택하기',
            privateAddress: '서버 주소 비공개'
        },
        ja_JP: {
            back: '← 戻る',
            backTitle: '戻る',
            subtitle: 'サーバーを選択してください',
            previewName: 'サーバー選択',
            previewDesc: '接続するサーバーを選択すると詳細情報が表示されます。',
            confirm: '選択する',
            privateAddress: 'サーバーアドレス非公開'
        },
        en_US: {
            back: '← Back',
            backTitle: 'Back',
            subtitle: 'Select a server',
            previewName: 'Server Select',
            previewDesc: 'Select a server to view details.',
            confirm: 'Select',
            privateAddress: 'Server address hidden'
        }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzServerI18n(rawServer){
    const lang = ktzServerSelectLanguage()
    const localized = rawServer.ktz?.i18n?.[lang] || rawServer.ktz?.i18n?.ko_KR
    if(localized == null){
        return null
    }
    return {
        name: localized.name,
        desc: localized.subtitle
    }
}

function ktzApplyServerSelectLanguage(){
    ktzServerSelectBack.innerHTML = ktzServerSelectText('back')
    ktzServerSelectBack.title = ktzServerSelectText('backTitle')
    const subtitle = document.getElementById('ktzServerSelectSubtitle')
    if(subtitle != null){
        subtitle.innerHTML = ktzServerSelectText('subtitle')
    }
    ktzServerSelectConfirm.innerHTML = ktzServerSelectText('confirm')
}

function getKtzServerMeta(rawServer){
    return rawServer.ktz || {}
}

function getKtzServerThumbnail(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.thumbnail || rawServer.icon || 'assets/images/servers/default_thumb.png'
}

function getKtzServerSelectBackground(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.serverSelectBackground || meta.background || rawServer.icon || 'assets/images/servers/default_bg.png'
}

function getKtzServerTitle(rawServer){
    const localized = ktzServerI18n(rawServer)
    if(localized?.name != null){
        return localized.name
    }
    const meta = getKtzServerMeta(rawServer)
    return meta.shortName || rawServer.name || rawServer.id
}

function getKtzServerDescription(rawServer){
    const localized = ktzServerI18n(rawServer)
    if(localized?.desc != null){
        return localized.desc
    }
    const meta = getKtzServerMeta(rawServer)
    return meta.subtitle || rawServer.description || 'No server description.'
}

function getKtzServerDisplayAddress(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.displayAddress || ktzServerSelectText('privateAddress')
}

function ktzSelectServerCard(serverId){
    const cards = Array.from(document.getElementsByClassName('ktzServerCard'))
    for(const card of cards){
        if(card.getAttribute('data-server-id') === serverId){
            card.setAttribute('selected', '')
        } else {
            card.removeAttribute('selected')
        }
    }
    ktzSelectedServerId = serverId
}

function ktzUpdatePreview(rawServer){
    ktzServerPreviewImage.style.backgroundImage = `url('${getKtzServerSelectBackground(rawServer)}')`
    ktzServerPreviewName.innerHTML = getKtzServerTitle(rawServer)
    ktzServerPreviewDesc.innerHTML = getKtzServerDescription(rawServer)
    ktzServerPreviewVersion.innerHTML = rawServer.minecraftVersion || '-'
    ktzServerPreviewAddress.innerHTML = getKtzServerDisplayAddress(rawServer)
}

async function ktzPopulateServerSelect(){
    ktzApplyServerSelectLanguage()
    const distro = await DistroAPI.getDistribution()
    const selectedServerId = ConfigManager.getSelectedServer()
    let htmlString = ''

    const visibleServers = distro.servers.filter(server => KTZ_SERVER_SELECT_VISIBLE_IDS.has(server.rawServer.id))

    for(const server of visibleServers){
        const raw = server.rawServer
        htmlString += `<button class="ktzServerCard" data-server-id="${raw.id}">
            <div class="ktzServerCardImage" style="background-image: url('${getKtzServerThumbnail(raw)}')"></div>
            <div class="ktzServerCardText">
                <span class="ktzServerCardName">${getKtzServerTitle(raw)}</span>
                <span class="ktzServerCardDesc">${getKtzServerDescription(raw)}</span>
            </div>
        </button>`
    }

    ktzServerList.innerHTML = htmlString

    const cards = Array.from(document.getElementsByClassName('ktzServerCard'))
    for(const card of cards){
        card.onclick = async () => {
            const serverId = card.getAttribute('data-server-id')
            const server = (await DistroAPI.getDistribution()).getServerById(serverId)
            ktzSelectServerCard(serverId)
            ktzUpdatePreview(server.rawServer)
            document.activeElement.blur()
        }
    }

    const initialServer = visibleServers.find(server => server.rawServer.id === selectedServerId) || visibleServers[0]
    if(initialServer != null){
        ktzSelectServerCard(initialServer.rawServer.id)
        ktzUpdatePreview(initialServer.rawServer)
    } else {
        ktzServerPreviewName.innerHTML = ktzServerSelectText('previewName')
        ktzServerPreviewDesc.innerHTML = ktzServerSelectText('previewDesc')
    }
}

async function ktzShowServerSelect(fromView = getCurrentView()){
    ktzServerSelectShownThisSession = true
    ktzServerSelectPreviousView = fromView || VIEWS.landing
    await ktzPopulateServerSelect()
    switchView(fromView, KTZ_SERVER_SELECT_VIEW)
}

ktzServerSelectConfirm.onclick = async () => {
    const distro = await DistroAPI.getDistribution()
    const selectedServer = KTZ_SERVER_SELECT_VISIBLE_IDS.has(ktzSelectedServerId)
        ? distro.getServerById(ktzSelectedServerId)
        : distro.getServerById('astervale')

    if(selectedServer != null){
        updateSelectedServer(selectedServer)
        refreshServerStatus(true)
    }

    switchView(KTZ_SERVER_SELECT_VIEW, VIEWS.landing)
}

ktzServerSelectBack.onclick = () => {
    const targetView = ktzServerSelectPreviousView === KTZ_SERVER_SELECT_VIEW ? VIEWS.landing : ktzServerSelectPreviousView
    switchView(KTZ_SERVER_SELECT_VIEW, targetView || VIEWS.landing)
}

const ktzServerSelectStartupTimer = setInterval(() => {
    if(ktzServerSelectShownThisSession){
        clearInterval(ktzServerSelectStartupTimer)
        return
    }
    if(!ktzServerSelectShownThisSession && getCurrentView() === VIEWS.landing && Object.keys(ConfigManager.getAuthAccounts()).length > 0){
        ktzShowServerSelect(VIEWS.landing).catch(err => {
            console.error('Unable to show KTZ server selection view.', err)
        })
    }
}, 400)
