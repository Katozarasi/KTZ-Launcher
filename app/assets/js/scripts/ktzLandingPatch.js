// KTZ patch: open the full-screen KTZ server select view from the existing landing server label.
// This keeps the original launch flow intact and only changes the server-change entry point.

async function ktzApplyLandingBackground(){
    try {
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(ConfigManager.getSelectedServer()) || distro.getMainServer()

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

    button.innerHTML = '서버 선택하기'
    button.title = '서버 선택 화면 열기'
    button.onclick = async e => {
        e.target.blur()
        await ktzShowServerSelect(VIEWS.landing)
    }
}

setTimeout(() => {
    ktzBindLandingServerSelectButton()
    ktzApplyLandingBackground()
}, 0)

// The original launcher updates this button text whenever the selected server changes.
// Keep the KTZ label stable and keep the landing background synced.
setInterval(() => {
    ktzBindLandingServerSelectButton()
    if(getCurrentView() === VIEWS.landing){
        ktzApplyLandingBackground()
    }
}, 1000)
