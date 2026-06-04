/**
 * Script for serverSelect.ejs
 * Adds a full-screen server selection step while keeping the existing launch flow intact.
 */

const KTZ_SERVER_SELECT_VIEW = '#serverSelectContainer'
const ktzServerList = document.getElementById('ktzServerList')
const ktzServerPreviewImage = document.getElementById('ktzServerPreviewImage')
const ktzServerPreviewName = document.getElementById('ktzServerPreviewName')
const ktzServerPreviewDesc = document.getElementById('ktzServerPreviewDesc')
const ktzServerPreviewVersion = document.getElementById('ktzServerPreviewVersion')
const ktzServerPreviewAddress = document.getElementById('ktzServerPreviewAddress')
const ktzServerSelectConfirm = document.getElementById('ktzServerSelectConfirm')

let ktzSelectedServerId = null
let ktzServerSelectShownThisSession = false

function getKtzServerMeta(rawServer){
    return rawServer.ktz || {}
}

function getKtzServerThumbnail(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.thumbnail || rawServer.icon || 'assets/images/servers/default_thumb.png'
}

function getKtzServerBackground(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.background || rawServer.icon || 'assets/images/servers/default_bg.png'
}

function getKtzServerTitle(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.shortName || rawServer.name || rawServer.id
}

function getKtzServerDescription(rawServer){
    const meta = getKtzServerMeta(rawServer)
    return meta.subtitle || rawServer.description || 'No server description.'
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
    ktzServerPreviewImage.style.backgroundImage = `url('${getKtzServerBackground(rawServer)}')`
    ktzServerPreviewName.innerHTML = getKtzServerTitle(rawServer)
    ktzServerPreviewDesc.innerHTML = getKtzServerDescription(rawServer)
    ktzServerPreviewVersion.innerHTML = rawServer.minecraftVersion || '-'
    ktzServerPreviewAddress.innerHTML = rawServer.address || '-'
}

async function ktzPopulateServerSelect(){
    const distro = await DistroAPI.getDistribution()
    const selectedServerId = ConfigManager.getSelectedServer()
    let htmlString = ''

    for(const server of distro.servers){
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

    const initialServer = distro.getServerById(selectedServerId) || distro.getMainServer()
    if(initialServer != null){
        ktzSelectServerCard(initialServer.rawServer.id)
        ktzUpdatePreview(initialServer.rawServer)
    }
}

async function ktzShowServerSelect(fromView = getCurrentView()){
    ktzServerSelectShownThisSession = true
    await ktzPopulateServerSelect()
    switchView(fromView, KTZ_SERVER_SELECT_VIEW)
}

ktzServerSelectConfirm.onclick = async () => {
    const distro = await DistroAPI.getDistribution()
    const selectedServer = distro.getServerById(ktzSelectedServerId) || distro.getMainServer()

    if(selectedServer != null){
        updateSelectedServer(selectedServer)
        refreshServerStatus(true)
    }

    switchView(KTZ_SERVER_SELECT_VIEW, VIEWS.landing)
}

setInterval(() => {
    if(!ktzServerSelectShownThisSession && getCurrentView() === VIEWS.landing && Object.keys(ConfigManager.getAuthAccounts()).length > 0){
        ktzShowServerSelect(VIEWS.landing).catch(err => {
            console.error('Unable to show KTZ server selection view.', err)
        })
    }
}, 400)
