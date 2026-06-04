// KTZ language selector injected into the Launcher settings tab.
// Changing language saves config and reloads the launcher window.

function ktzLanguageLabel(language){
    switch(language){
        case 'ja_JP': return '日本語'
        case 'en_US': return 'English'
        case 'ko_KR':
        default: return '한국어'
    }
}

function ktzLanguageText(key){
    const lang = ConfigManager.getLanguage ? ConfigManager.getLanguage() : 'ko_KR'
    const text = {
        ko_KR: {
            title: '언어',
            desc: '런처 표시 언어를 선택합니다. 변경 즉시 런처가 새로고침됩니다.',
            optionKo: '한국어',
            optionJa: '日本語',
            optionEn: 'English'
        },
        ja_JP: {
            title: '言語',
            desc: 'ランチャーの表示言語を選択します。変更後すぐにランチャーを再読み込みします。',
            optionKo: '한국어',
            optionJa: '日本語',
            optionEn: 'English'
        },
        en_US: {
            title: 'Language',
            desc: 'Select the launcher display language. The launcher will reload immediately after changing it.',
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

    const currentLanguage = ConfigManager.getLanguage ? ConfigManager.getLanguage() : 'ko_KR'
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
        ConfigManager.setLanguage(newLanguage)
        ConfigManager.save()
        remote.getCurrentWindow().reload()
    }
}

setInterval(ktzInjectLanguageSelector, 500)
