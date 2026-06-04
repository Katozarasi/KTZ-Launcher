// KTZ progress patch.
// Adds clearer validation/download/launch progress text without changing the base launch flow.

let ktzProgressPhase = ''

function ktzProgressLanguage(){
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

function ktzProgressText(key){
    const lang = ktzProgressLanguage()
    const text = {
        ko_KR: { validating: '파일 검사', downloading: '파일 다운로드', preparing: '실행 준비', launching: '게임 실행', percent: '{phase} · {percent}%' },
        ja_JP: { validating: 'ファイル検査', downloading: 'ファイルダウンロード', preparing: '起動準備', launching: 'ゲーム起動', percent: '{phase} · {percent}%' },
        en_US: { validating: 'Validating files', downloading: 'Downloading files', preparing: 'Preparing launch', launching: 'Launching game', percent: '{phase} · {percent}%' }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzResolveProgressPhase(details){
    const text = String(details || '').toLowerCase()
    if(text.includes('검사') || text.includes('validat') || text.includes('検査')){
        return ktzProgressText('validating')
    }
    if(text.includes('다운로드') || text.includes('download') || text.includes('ダウンロード')){
        return ktzProgressText('downloading')
    }
    if(text.includes('준비') || text.includes('prepar') || text.includes('準備')){
        return ktzProgressText('preparing')
    }
    if(text.includes('실행') || text.includes('launch') || text.includes('起動')){
        return ktzProgressText('launching')
    }
    return details
}

setTimeout(() => {
    if(typeof setLaunchDetails === 'function' && typeof setLaunchPercentage === 'function'){
        const originalSetLaunchDetails = setLaunchDetails
        const originalSetLaunchPercentage = setLaunchPercentage
        const originalSetDownloadPercentage = typeof setDownloadPercentage === 'function' ? setDownloadPercentage : null

        setLaunchDetails = function(details){
            ktzProgressPhase = ktzResolveProgressPhase(details)
            originalSetLaunchDetails(details)
        }

        setLaunchPercentage = function(percent){
            originalSetLaunchPercentage(percent)
            const label = document.getElementById('launch_progress_label')
            if(label != null && ktzProgressPhase){
                label.innerHTML = ktzProgressText('percent')
                    .replace('{phase}', ktzProgressPhase)
                    .replace('{percent}', Math.round(percent))
            }
        }

        if(originalSetDownloadPercentage != null){
            setDownloadPercentage = function(percent){
                originalSetDownloadPercentage(percent)
                const label = document.getElementById('launch_progress_label')
                if(label != null){
                    label.innerHTML = ktzProgressText('percent')
                        .replace('{phase}', ktzProgressPhase || ktzProgressText('downloading'))
                        .replace('{percent}', Math.round(percent))
                }
            }
        }
    }
}, 0)
