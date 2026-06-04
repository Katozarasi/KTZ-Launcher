// KTZ patch: open the full-screen KTZ server select view from the existing landing server label.
// This keeps the original launch flow intact and only changes the server-change entry point.

setTimeout(() => {
    const button = document.getElementById('server_selection_button')
    if(button != null){
        button.onclick = async e => {
            e.target.blur()
            await ktzShowServerSelect(VIEWS.landing)
        }
    }
}, 0)
