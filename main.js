const { app, BrowserWindow } = require('electron')

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if(!hasSingleInstanceLock){
    app.quit()
} else {
    app.on('second-instance', () => {
        const windows = BrowserWindow.getAllWindows()
        const window = windows.length > 0 ? windows[0] : null

        if(window != null){
            if(window.isMinimized()){
                window.restore()
            }
            window.show()
            window.focus()
        }
    })

    require('./index')
}
