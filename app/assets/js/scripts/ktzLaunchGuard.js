// KTZ launch guard.
// Prevents duplicate PLAY clicks and keeps a visible launch/running state until Minecraft exits.

function ktzInstallLaunchGuard(){
    try {
        const launchButton = document.getElementById('launch_button')
        const serverButton = document.getElementById('server_selection_button')
        const launchContent = document.getElementById('launch_content')
        const launchDetails = document.getElementById('launch_details')

        if(launchButton == null || launchButton.hasAttribute('ktz-launch-guard')){
            return
        }

        launchButton.setAttribute('ktz-launch-guard', '')

        const ktzProcessBuilder = require('./assets/js/processbuilder')
        const originalButtonText = launchButton.textContent
        let launchState = 'idle'
        let currentProcess = null
        let launchStartedAt = 0
        let launchMonitorTimer = null

        function currentLanguage(){
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

        function text(key){
            const language = currentLanguage()
            const messages = {
                ko_KR: {
                    preparing: '실행을 준비하고 있어요! 잠시만 기다려 주세요 ✨',
                    alreadyStarting: '이미 게임을 실행하고 있어요! 조금만 기다려 주세요 ✨',
                    checkingPack: '에스터베일 클라이언트팩을 확인하고 있어요...',
                    launching: 'Minecraft를 실행하고 있어요...',
                    running: '게임이 실행 중이에요!',
                    buttonRunning: '실행 중'
                },
                ja_JP: {
                    preparing: '起動を準備しています。少しだけお待ちください ✨',
                    alreadyStarting: 'すでにゲームを起動しています。少しだけお待ちください ✨',
                    checkingPack: 'アスターヴェイルのクライアントパックを確認しています...',
                    launching: 'Minecraftを起動しています...',
                    running: 'ゲームを実行中です！',
                    buttonRunning: '実行中'
                },
                en_US: {
                    preparing: 'Preparing to launch! Please wait a moment ✨',
                    alreadyStarting: 'The game is already starting! Please wait a moment ✨',
                    checkingPack: 'Checking the Aster Vale client pack...',
                    launching: 'Starting Minecraft...',
                    running: 'The game is running!',
                    buttonRunning: 'RUNNING'
                }
            }
            return (messages[language] || messages.ko_KR)[key]
        }

        function setStatus(message, percent = null){
            try {
                if(typeof setLaunchDetails === 'function'){
                    setLaunchDetails(message)
                } else {
                    const label = document.getElementById('launch_details_text')
                    if(label != null){
                        label.textContent = message
                    }
                }

                if(percent != null && typeof setLaunchPercentage === 'function'){
                    setLaunchPercentage(percent)
                }
            } catch(err) {
                console.warn('[KTZ Launch Guard] Unable to update launch status.', err)
            }
        }

        function showLaunchStatus(){
            try {
                if(typeof toggleLaunchArea === 'function'){
                    toggleLaunchArea(true)
                } else {
                    if(launchDetails != null) launchDetails.style.display = 'flex'
                    if(launchContent != null) launchContent.style.display = 'none'
                }
            } catch(_err) {
                // The progress bar is optional while the window is closing.
            }
        }

        function setWindowProgress(value){
            try {
                remote.getCurrentWindow().setProgressBar(value)
            } catch(_err) {
                // The progress bar is optional while the window is closing.
            }
        }

        function lockLaunch(){
            launchState = 'starting'
            launchStartedAt = Date.now()
            launchButton.disabled = true
            launchButton.textContent = text('buttonRunning')
            launchButton.setAttribute('aria-busy', 'true')
            if(serverButton != null){
                serverButton.disabled = true
            }
            showLaunchStatus()
            setStatus(text('preparing'), 0)
            setWindowProgress(2)
            window.ktzLaunchState = launchState
            startLaunchMonitor()
        }

        function markRunning(){
            launchState = 'running'
            launchButton.disabled = true
            launchButton.textContent = text('buttonRunning')
            launchButton.setAttribute('aria-busy', 'true')
            if(serverButton != null){
                serverButton.disabled = true
            }
            setStatus(text('running'), 100)
            setWindowProgress(-1)
            window.ktzLaunchState = launchState
        }

        function unlockLaunch(){
            if(launchMonitorTimer != null){
                clearTimeout(launchMonitorTimer)
                launchMonitorTimer = null
            }
            launchState = 'idle'
            currentProcess = null
            launchStartedAt = 0
            launchButton.textContent = originalButtonText
            launchButton.removeAttribute('aria-busy')
            launchButton.disabled = ConfigManager.getSelectedServer() == null
            if(serverButton != null){
                serverButton.disabled = false
            }
            setWindowProgress(-1)
            window.ktzLaunchState = launchState
        }

        function startLaunchMonitor(){
            if(launchMonitorTimer != null){
                return
            }

            const check = () => {
                launchMonitorTimer = null
                if(launchState !== 'starting' || currentProcess != null){
                    return
                }

                const detailsHidden = launchDetails == null || window.getComputedStyle(launchDetails).display === 'none'
                const contentVisible = launchContent != null && window.getComputedStyle(launchContent).display !== 'none'
                const timedOut = launchStartedAt > 0 && Date.now() - launchStartedAt > 30 * 60 * 1000

                if((detailsHidden && contentVisible) || timedOut){
                    unlockLaunch()
                    return
                }
                launchMonitorTimer = setTimeout(check, 500)
            }

            launchMonitorTimer = setTimeout(check, 500)
        }

        window.ktzSetLaunchStatus = setStatus
        window.ktzLaunchState = launchState
        window.ktzUnlockLaunch = unlockLaunch

        // Capture the click before the stock launcher handler. The first click is allowed;
        // every following click is ignored until the Minecraft process exits or launch fails.
        launchButton.addEventListener('click', event => {
            if(launchState !== 'idle'){
                event.preventDefault()
                event.stopImmediatePropagation()
                showLaunchStatus()
                setStatus(text('alreadyStarting'))
                return
            }
            lockLaunch()
        }, true)

        if(!ktzProcessBuilder.prototype.ktzDuplicateLaunchGuardPatched){
            ktzProcessBuilder.prototype.ktzDuplicateLaunchGuardPatched = true
            const originalBuild = ktzProcessBuilder.prototype.build

            ktzProcessBuilder.prototype.build = function(...args){
                if(currentProcess != null && currentProcess.exitCode == null && !currentProcess.killed){
                    setStatus(text('alreadyStarting'))
                    throw new Error('Minecraft is already running for this launcher session.')
                }

                const usesManagedPack = this.server?.rawServer?.ktz?.packManifest != null
                setStatus(usesManagedPack ? text('checkingPack') : text('launching'))

                let child
                try {
                    child = originalBuild.apply(this, args)
                } catch(err) {
                    unlockLaunch()
                    throw err
                }

                if(child == null || typeof child.once !== 'function'){
                    unlockLaunch()
                    return child
                }

                currentProcess = child
                markRunning()

                let released = false
                const release = () => {
                    if(released){
                        return
                    }
                    released = true
                    if(currentProcess === child){
                        unlockLaunch()
                    }
                }

                child.once('close', release)
                child.once('error', release)
                return child
            }
        }

        console.log('[KTZ Launch Guard] Duplicate launch protection enabled.')
    } catch(err) {
        console.error('[KTZ Launch Guard] Unable to install launch guard.', err)
    }
}

setTimeout(ktzInstallLaunchGuard, 0)
