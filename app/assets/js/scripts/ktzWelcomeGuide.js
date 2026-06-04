// KTZ first run guide.

function ktzGuideConfigFile(){
    const path = require('path')
    return path.join(ConfigManager.getLauncherDirectory(), 'config.json')
}

function ktzGuideReadConfig(){
    try {
        const fs = require('fs-extra')
        const file = ktzGuideConfigFile()
        if(fs.existsSync(file)){
            return JSON.parse(fs.readFileSync(file, 'UTF-8'))
        }
    } catch(_err) {}
    return null
}

function ktzGuideWriteConfig(config){
    const fs = require('fs-extra')
    fs.writeFileSync(ktzGuideConfigFile(), JSON.stringify(config, null, 4), 'UTF-8')
}

function ktzGuideLanguage(){
    return ktzGuideReadConfig()?.settings?.launcher?.language || 'ko_KR'
}

function ktzGuideText(key){
    const lang = ktzGuideLanguage()
    const text = {
        ko_KR: { title: 'KTZ 안내', body: '1. 계정을 준비합니다.<br>2. 서버를 선택합니다.<br>3. PLAY를 누릅니다.', close: '확인', hide: '다시 보지 않기' },
        ja_JP: { title: 'KTZ案内', body: '1. アカウントを準備します。<br>2. サーバーを選択します。<br>3. PLAYを押します。', close: '確認', hide: '再表示しない' },
        en_US: { title: 'KTZ Guide', body: '1. Prepare your account.<br>2. Select a server.<br>3. Press PLAY.', close: 'OK', hide: 'Do not show again' }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzGuideDismiss(){
    const config = ktzGuideReadConfig()
    if(config == null){ return }
    config.ktz = config.ktz || {}
    config.ktz.firstRunGuideHidden = true
    ktzGuideWriteConfig(config)
}

function ktzGuideShouldShow(){
    return ktzGuideReadConfig()?.ktz?.firstRunGuideHidden !== true
}

function ktzShowWelcomeGuide(){
    if(!ktzGuideShouldShow() || document.getElementById('ktzWelcomeGuide') != null){ return }

    const overlay = document.createElement('div')
    overlay.id = 'ktzWelcomeGuide'
    overlay.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);'
    overlay.innerHTML = '<div style="width:430px;border-radius:18px;background:rgba(24,24,28,.96);color:white;padding:28px;box-shadow:0 18px 60px rgba(0,0,0,.45);"><div style="font-size:24px;font-weight:800;margin-bottom:14px;">' + ktzGuideText('title') + '</div><div style="font-size:15px;line-height:1.8;opacity:.9;margin-bottom:22px;">' + ktzGuideText('body') + '</div><label style="display:flex;align-items:center;gap:8px;font-size:13px;opacity:.85;margin-bottom:18px;"><input id="ktzGuideHide" type="checkbox"> ' + ktzGuideText('hide') + '</label><div style="text-align:right;"><button id="ktzGuideClose" style="min-width:90px;height:36px;border:0;border-radius:9px;background:white;color:#111;font-weight:700;cursor:pointer;">' + ktzGuideText('close') + '</button></div></div>'

    document.body.appendChild(overlay)
    document.getElementById('ktzGuideClose').onclick = () => {
        if(document.getElementById('ktzGuideHide').checked){ ktzGuideDismiss() }
        overlay.remove()
    }
}

setTimeout(() => {
    if(Object.keys(ConfigManager.getAuthAccounts()).length === 0){ ktzShowWelcomeGuide() }
}, 1500)
