// KTZ support tools injected into Launcher settings.
// Adds quick buttons for diagnostics, data folder, and log folder.

function ktzSupportLanguage(){
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

function ktzSupportText(key){
    const lang = ktzSupportLanguage()
    const text = {
        ko_KR: {
            title: '지원 도구',
            desc: '문제 해결에 필요한 정보를 복사하거나 폴더를 엽니다.',
            copy: '오류 정보 복사',
            openData: '데이터 폴더 열기',
            openLogs: '로그 폴더 열기',
            copied: '오류 정보가 클립보드에 복사되었습니다.'
        },
        ja_JP: {
            title: 'サポートツール',
            desc: 'トラブルシューティングに必要な情報をコピーしたり、フォルダーを開いたりします。',
            copy: 'エラー情報をコピー',
            openData: 'データフォルダーを開く',
            openLogs: 'ログフォルダーを開く',
            copied: 'エラー情報をクリップボードにコピーしました。'
        },
        en_US: {
            title: 'Support Tools',
            desc: 'Copy troubleshooting information or open useful folders.',
            copy: 'Copy Error Info',
            openData: 'Open Data Folder',
            openLogs: 'Open Logs Folder',
            copied: 'Error information copied to clipboard.'
        }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzSupportButton(label, id){
    return `<button id="${id}" class="settingsAboutButton" style="margin-right: 8px; margin-top: 8px;">${label}</button>`
}

function ktzGetSupportInfo(){
    const path = require('path')
    const pkg = require(path.join(process.cwd(), 'package.json'))
    let selectedServer = null
    let selectedAccount = null

    try {
        selectedServer = ConfigManager.getSelectedServer()
    } catch(_err) {}

    try {
        const account = ConfigManager.getSelectedAccount()
        selectedAccount = account?.displayName || account?.username || null
    } catch(_err) {}

    return [
        'KTZ Launcher Support Info',
        `Time: ${new Date().toISOString()}`,
        `Launcher Version: ${pkg.version}`,
        `Electron: ${process.versions.electron}`,
        `Chrome: ${process.versions.chrome}`,
        `Node: ${process.versions.node}`,
        `Platform: ${process.platform} ${process.arch}`,
        `Selected Server: ${selectedServer || '-'}`,
        `Selected Account: ${selectedAccount || '-'}`,
        `Launcher Directory: ${ConfigManager.getLauncherDirectory()}`,
        `Data Directory: ${ConfigManager.getDataDirectory()}`
    ].join('\n')
}

function ktzInjectSupportTools(){
    const launcherTab = document.getElementById('settingsTabLauncher')
    if(launcherTab == null || document.getElementById('ktzSupportToolsContainer') != null){
        return
    }

    const wrapper = document.createElement('div')
    wrapper.id = 'ktzSupportToolsContainer'
    wrapper.className = 'settingsFieldContainer'
    wrapper.innerHTML = `
        <div class="settingsFieldLeft">
            <span class="settingsFieldTitle">${ktzSupportText('title')}</span>
            <span class="settingsFieldDesc">${ktzSupportText('desc')}</span>
        </div>
        <div class="settingsFieldRight" style="display: flex; flex-wrap: wrap; justify-content: flex-end;">
            ${ktzSupportButton(ktzSupportText('copy'), 'ktzCopySupportInfo')}
            ${ktzSupportButton(ktzSupportText('openData'), 'ktzOpenDataFolder')}
            ${ktzSupportButton(ktzSupportText('openLogs'), 'ktzOpenLogsFolder')}
        </div>`

    launcherTab.appendChild(wrapper)

    document.getElementById('ktzCopySupportInfo').onclick = () => {
        const { clipboard } = require('electron')
        clipboard.writeText(ktzGetSupportInfo())
        alert(ktzSupportText('copied'))
    }

    document.getElementById('ktzOpenDataFolder').onclick = () => {
        shell.openPath(ConfigManager.getDataDirectory())
    }

    document.getElementById('ktzOpenLogsFolder').onclick = () => {
        const fs = require('fs-extra')
        const path = require('path')
        const logsDir = path.join(ConfigManager.getLauncherDirectory(), 'logs')
        fs.ensureDirSync(logsDir)
        shell.openPath(logsDir)
    }
}

setInterval(ktzInjectSupportTools, 700)
