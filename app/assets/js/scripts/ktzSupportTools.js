// KTZ support tools injected into Launcher settings.
// Adds quick buttons for diagnostics, data folder, log folder, repair, and cache reset.

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
            repair: '파일 복구',
            resetCache: '캐시 초기화',
            copied: '오류 정보가 클립보드에 복사되었습니다.',
            repairDone: '선택한 서버의 관리 모드 파일을 정리했습니다. 다음 PLAY 시 필요한 파일을 다시 검사/다운로드합니다.',
            resetDone: '캐시 초기화를 완료했습니다. 런처를 다시 실행해 주세요.',
            confirmReset: '런처 캐시를 초기화할까요? 로그인 정보는 유지하고 뉴스/임시 캐시만 정리합니다.'
        },
        ja_JP: {
            title: 'サポートツール',
            desc: 'トラブルシューティングに必要な情報をコピーしたり、フォルダーを開いたりします。',
            copy: 'エラー情報をコピー',
            openData: 'データフォルダーを開く',
            openLogs: 'ログフォルダーを開く',
            repair: 'ファイル修復',
            resetCache: 'キャッシュ初期化',
            copied: 'エラー情報をクリップボードにコピーしました。',
            repairDone: '選択中サーバーの管理Modファイルを整理しました。次回PLAY時に必要なファイルを再検査/再ダウンロードします。',
            resetDone: 'キャッシュ初期化が完了しました。ランチャーを再起動してください。',
            confirmReset: 'ランチャーキャッシュを初期化しますか？ログイン情報は保持し、ニュース/一時キャッシュのみ整理します。'
        },
        en_US: {
            title: 'Support Tools',
            desc: 'Copy troubleshooting information or open useful folders.',
            copy: 'Copy Error Info',
            openData: 'Open Data Folder',
            openLogs: 'Open Logs Folder',
            repair: 'Repair Files',
            resetCache: 'Reset Cache',
            copied: 'Error information copied to clipboard.',
            repairDone: 'Managed mod files for the selected server were cleared. Required files will be checked/downloaded again on next PLAY.',
            resetDone: 'Cache reset complete. Please restart the launcher.',
            confirmReset: 'Reset launcher cache? Login data will be preserved; only news/temp cache will be cleared.'
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

async function ktzRepairSelectedServer(){
    const fs = require('fs-extra')
    const path = require('path')
    const selectedServer = ConfigManager.getSelectedServer()
    if(!selectedServer){
        return
    }

    const instanceDir = path.join(ConfigManager.getInstanceDirectory(), selectedServer)
    const ktzModstoreDir = path.join(ConfigManager.getCommonDirectory(), 'modstore', 'ktz')
    const ktzFabricDir = path.join(ConfigManager.getCommonDirectory(), 'mods', 'fabric', 'ktz')
    const generatedLists = [
        path.join(instanceDir, 'forgeMods.list'),
        path.join(instanceDir, 'forgeModList.json'),
        path.join(instanceDir, 'liteloaderModList.json')
    ]

    fs.removeSync(ktzModstoreDir)
    fs.removeSync(ktzFabricDir)
    for(const file of generatedLists){
        fs.removeSync(file)
    }

    alert(ktzSupportText('repairDone'))
}

async function ktzResetLauncherCache(){
    if(!confirm(ktzSupportText('confirmReset'))){
        return
    }
    const fs = require('fs-extra')
    const path = require('path')
    const launcherDir = ConfigManager.getLauncherDirectory()
    const cacheTargets = [
        path.join(launcherDir, 'Cache'),
        path.join(launcherDir, 'Code Cache'),
        path.join(launcherDir, 'GPUCache'),
        path.join(launcherDir, 'logs')
    ]

    for(const target of cacheTargets){
        try {
            fs.removeSync(target)
        } catch(_err) {}
    }

    try {
        const config = JSON.parse(fs.readFileSync(path.join(launcherDir, 'config.json'), 'UTF-8'))
        config.newsCache = {
            date: null,
            content: null,
            dismissed: false
        }
        fs.writeFileSync(path.join(launcherDir, 'config.json'), JSON.stringify(config, null, 4), 'UTF-8')
    } catch(_err) {}

    alert(ktzSupportText('resetDone'))
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
            ${ktzSupportButton(ktzSupportText('repair'), 'ktzRepairFiles')}
            ${ktzSupportButton(ktzSupportText('resetCache'), 'ktzResetCache')}
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

    document.getElementById('ktzRepairFiles').onclick = ktzRepairSelectedServer
    document.getElementById('ktzResetCache').onclick = ktzResetLauncherCache
}

setInterval(ktzInjectSupportTools, 700)
