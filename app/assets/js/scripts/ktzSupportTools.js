// KTZ support tools injected into Launcher settings.
// Adds quick buttons for diagnostics, data folders, file repair, and Aster Vale pack recovery.

function ktzSupportLanguage(){
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

function ktzSupportText(key){
    const lang = ktzSupportLanguage()
    const text = {
        ko_KR: {
            title: '지원 도구',
            desc: '문제 해결에 필요한 정보를 복사하거나 폴더를 열 수 있어요.',
            copy: '오류 정보 복사',
            openData: '데이터 폴더 열기',
            openLogs: '로그 폴더 열기',
            repair: '파일 복구',
            reinstallPack: '에스터베일 팩 재설치',
            resetCache: '캐시 초기화',
            copied: '오류 정보가 클립보드에 복사되었어요!',
            repairDone: '선택한 서버의 관리 파일을 정리했어요. 다음 PLAY에서 필요한 파일을 다시 확인할게요!',
            packRepairDone: '에스터베일 팩을 다음 PLAY에서 안전하게 다시 설치할게요!',
            packRepairUnavailable: '에스터베일 서버를 선택한 뒤 다시 눌러 주세요.',
            resetDone: '캐시 초기화를 완료했어요. 런처를 다시 실행해 주세요!',
            confirmPackRepair: '에스터베일 클라이언트팩을 다음 PLAY에서 다시 설치할까요?',
            confirmReset: '런처 캐시를 초기화할까요? 로그인 정보는 유지하고 뉴스와 임시 캐시만 정리해요.'
        },
        ja_JP: {
            title: 'サポートツール',
            desc: 'トラブルシューティング情報をコピーしたり、フォルダーを開いたりできます。',
            copy: 'エラー情報をコピー',
            openData: 'データフォルダーを開く',
            openLogs: 'ログフォルダーを開く',
            repair: 'ファイル修復',
            reinstallPack: 'アスターヴェイルパック再インストール',
            resetCache: 'キャッシュ初期化',
            copied: 'エラー情報をクリップボードにコピーしました。',
            repairDone: '選択中サーバーの管理ファイルを整理しました。次回PLAY時に再確認します。',
            packRepairDone: '次回PLAY時にアスターヴェイルパックを安全に再インストールします。',
            packRepairUnavailable: 'アスターヴェイルサーバーを選択してからもう一度お試しください。',
            resetDone: 'キャッシュ初期化が完了しました。ランチャーを再起動してください。',
            confirmPackRepair: '次回PLAY時にアスターヴェイルクライアントパックを再インストールしますか？',
            confirmReset: 'ランチャーキャッシュを初期化しますか？ログイン情報は保持します。'
        },
        en_US: {
            title: 'Support Tools',
            desc: 'Copy troubleshooting information or open useful folders.',
            copy: 'Copy Error Info',
            openData: 'Open Data Folder',
            openLogs: 'Open Logs Folder',
            repair: 'Repair Files',
            reinstallPack: 'Reinstall Aster Vale Pack',
            resetCache: 'Reset Cache',
            copied: 'Error information was copied to the clipboard!',
            repairDone: 'Managed files for the selected server were cleared. They will be checked on the next PLAY.',
            packRepairDone: 'The Aster Vale pack will be safely reinstalled on the next PLAY.',
            packRepairUnavailable: 'Select the Aster Vale server and try again.',
            resetDone: 'Cache reset complete. Please restart the launcher.',
            confirmPackRepair: 'Reinstall the Aster Vale client pack on the next PLAY?',
            confirmReset: 'Reset launcher cache? Login data will be preserved.'
        }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzSupportButton(label, id){
    return `<button id="${id}" class="settingsAboutButton" style="margin-right: 8px; margin-top: 8px;">${label}</button>`
}

function ktzAsterValePackVersion(){
    try {
        return require('./assets/js/astervalepackmanager').installedVersion()
    } catch(_err) {
        return null
    }
}

function ktzGetSupportInfo(){
    const path = require('path')
    const pkg = require(path.join(process.cwd(), 'package.json'))
    let selectedServer = null
    let selectedAccount = null

    try {
        selectedServer = ConfigManager.getSelectedServer()
    } catch(_err) {
        // Diagnostics can still be copied without a selected server.
    }

    try {
        const account = ConfigManager.getSelectedAccount()
        selectedAccount = account?.displayName || account?.username || null
    } catch(_err) {
        // Diagnostics can still be copied without a selected account.
    }

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
        `Aster Vale Pack: ${ktzAsterValePackVersion() || '-'}`,
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

    if(selectedServer === 'astervale'){
        try {
            require('./assets/js/astervalepackmanager').reset()
        } catch(_err) {
            // Continue the regular repair if the pack state is already absent.
        }
    }

    alert(ktzSupportText('repairDone'))
}

async function ktzReinstallAsterValePack(){
    if(ConfigManager.getSelectedServer() !== 'astervale'){
        alert(ktzSupportText('packRepairUnavailable'))
        return
    }

    if(!confirm(ktzSupportText('confirmPackRepair'))){
        return
    }

    try {
        require('./assets/js/astervalepackmanager').reset()
        alert(ktzSupportText('packRepairDone'))
    } catch(err) {
        console.error('Unable to reset Aster Vale pack state.', err)
        alert(err.message)
    }
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
        } catch(_err) {
            // Continue resetting the remaining cache entries.
        }
    }

    try {
        const config = JSON.parse(fs.readFileSync(path.join(launcherDir, 'config.json'), 'UTF-8'))
        config.newsCache = {
            date: null,
            content: null,
            dismissed: false
        }
        fs.writeFileSync(path.join(launcherDir, 'config.json'), JSON.stringify(config, null, 4), 'UTF-8')
    } catch(_err) {
        // Cache cleanup is still useful if the config file cannot be rewritten.
    }

    alert(ktzSupportText('resetDone'))
}

function ktzInjectSupportTools(){
    const launcherTab = document.getElementById('settingsTabLauncher')
    if(document.getElementById('ktzSupportToolsContainer') != null){
        return true
    }
    if(launcherTab == null){
        return false
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
            ${ktzSupportButton(ktzSupportText('reinstallPack'), 'ktzReinstallAsterValePack')}
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
    document.getElementById('ktzReinstallAsterValePack').onclick = ktzReinstallAsterValePack
    document.getElementById('ktzResetCache').onclick = ktzResetLauncherCache
    return true
}

function ktzInstallSupportTools(){
    if(ktzInjectSupportTools()){
        return
    }

    const observer = new MutationObserver(() => {
        if(ktzInjectSupportTools()){
            observer.disconnect()
        }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 15000)
}

setTimeout(ktzInstallSupportTools, 0)
