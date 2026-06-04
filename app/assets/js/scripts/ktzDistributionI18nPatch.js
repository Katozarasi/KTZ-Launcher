// KTZ patch: prefer server-specific i18n values from distribution.json.
// Expected format: server.ktz.i18n[language].name / subtitle / description.

function ktzDistI18nLanguage(){
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

function ktzDistI18nValue(rawServer, key){
    const lang = ktzDistI18nLanguage()
    const i18n = rawServer?.ktz?.i18n
    const localized = i18n?.[lang] || i18n?.ko_KR || null

    if(localized == null){
        return null
    }

    if(key === 'name'){
        return localized.name || localized.shortName || null
    }

    if(key === 'desc'){
        return localized.subtitle || localized.description || null
    }

    return localized[key] || null
}

if(typeof ktzServerI18n === 'function'){
    const ktzOriginalServerI18n = ktzServerI18n
    ktzServerI18n = function(rawServer){
        const name = ktzDistI18nValue(rawServer, 'name')
        const desc = ktzDistI18nValue(rawServer, 'desc')
        if(name != null || desc != null){
            return { name, desc }
        }
        return ktzOriginalServerI18n(rawServer)
    }
}

if(typeof ktzLocalizedServerName === 'function'){
    const ktzOriginalLocalizedServerName = ktzLocalizedServerName
    ktzLocalizedServerName = function(rawServer){
        return ktzDistI18nValue(rawServer, 'name') || ktzOriginalLocalizedServerName(rawServer)
    }
}
