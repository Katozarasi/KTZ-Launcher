// KTZ patch: open the full-screen KTZ server select view from the existing landing server label.
// This keeps the original launch flow intact and only changes the server-change entry point.

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

setTimeout(ktzBindLandingServerSelectButton, 0)

// The original launcher updates this button text whenever the selected server changes.
// Keep the KTZ label stable without touching the original launch/update logic.
setInterval(ktzBindLandingServerSelectButton, 1000)
