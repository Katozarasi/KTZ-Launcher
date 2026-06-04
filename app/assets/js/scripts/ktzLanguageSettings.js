// KTZ language selector injected into the Launcher settings tab.
// Changing language saves config and relaunches the launcher app.

const ktzLangFs = require('fs-extra')
const ktzLangPath = require('path')

function ktzGetConfigPath(){
    return ktzLangPath.join(ConfigManager.getLauncherDirectory(), 'config.json')
}

function ktzReadConfig(){
    try {
        const configPath = ktzGetConfigPath()
        if(ktzLangFs.existsSync(configPath)){
            return JSON.parse(ktzLangFs.readFileSync(configPath, 'UTF-8'))
        }
    } catch(_err) {}
    return null
}

function ktzWriteConfig(config){
    const configPath = ktzGetConfigPath()
    ktzLangFs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'UTF-8')
}

function ktzGetLanguage(){
    const config = ktzReadConfig()
    return config?.settings?.launcher?.language || 'ko_KR'
}

function ktzSetLanguage(language){
    const config = ktzReadConfig()
    if(config == null){
        return
    }
    if(config.settings == null){
        config.settings = {}
    }
    if(config.settings.launcher == null){
        config.settings.launcher = {}
    }
    config.settings.launcher.language = language
    ktzWriteConfig(config)
}

function ktzRestartLauncher(){
    if(remote?.app?.relaunch != null){
        remote.app.relaunch()
        remote.app.exit(0)
    } else {
        remote.getCurrentWindow().reload()
    }
}

function ktzLanguageText(key){
    const lang = ktzGetLanguage()
    const text = {
        ko_KR: {
            title: '언어',
            desc: '런처 표시 언어를 선택합니다. 변경 즉시 런처가 다시 시작됩니다.',
            optionKo: '한국어',
            optionJa: '日本語',
            optionEn: 'English'
        },
        ja_JP: {
            title: '言語',
            desc: 'ランチャーの表示言語を選択します。変更後すぐにランチャーを再起動します。',
            optionKo: '한국어',
            optionJa: '日本語',
            optionEn: 'English'
        },
        en_US: {
            title: 'Language',
            desc: 'Select the launcher display language. The launcher will restart immediately after changing it.',
            optionKo: '한국어',
            optionJa: '日本語',
            optionEn: 'English'
        }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzInjectLanguageSelector(){
    const launcherTab = document.getElementById('settingsTabLauncher')
    if(launcherTab == null || document.getElementById('ktzLanguageContainer') != null){
        return
    }

    const currentLanguage = ktzGetLanguage()
    const wrapper = document.createElement('div')
    wrapper.id = 'ktzLanguageContainer'
    wrapper.className = 'settingsFieldContainer'
    wrapper.innerHTML = `
        <div class="settingsFieldLeft">
            <span class="settingsFieldTitle">${ktzLanguageText('title')}</span>
            <span class="settingsFieldDesc">${ktzLanguageText('desc')}</span>
        </div>
        <div class="settingsFieldRight">
            <select id="ktzLanguageSelect" style="min-width: 150px; height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.45); color: #fff; padding: 0 10px; outline: none;">
                <option value="ko_KR">${ktzLanguageText('optionKo')}</option>
                <option value="ja_JP">${ktzLanguageText('optionJa')}</option>
                <option value="en_US">${ktzLanguageText('optionEn')}</option>
            </select>
        </div>`

    const header = launcherTab.getElementsByClassName('settingsTabHeader')[0]
    if(header != null && header.nextSibling != null){
        launcherTab.insertBefore(wrapper, header.nextSibling)
    } else {
        launcherTab.appendChild(wrapper)
    }

    const select = document.getElementById('ktzLanguageSelect')
    select.value = currentLanguage
    select.onchange = () => {
        const newLanguage = select.value
        if(newLanguage === currentLanguage){
            return
        }
        ktzSetLanguage(newLanguage)
        ktzRestartLauncher()
    }
}

setInterval(ktzInjectLanguageSelector, 500)
