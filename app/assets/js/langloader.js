const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')
const ConfigManager = require('./configmanager')

let lang

exports.loadLanguage = function(id){
    lang = merge(lang || {}, toml.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`))) || {})
}

exports.query = function(id, placeHolders){
    let query = id.split('.')
    let res = lang
    for(let q of query){
        res = res[q]
    }
    let text = res === lang ? '' : res
    if (placeHolders) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

function getConfiguredLanguage(){
    try {
        const configPath = path.join(ConfigManager.getLauncherDirectory(), 'config.json')
        if(fs.existsSync(configPath)){
            const config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            return config?.settings?.launcher?.language || 'ko_KR'
        }
    } catch(_err) {
        // Fallback below.
    }
    return 'ko_KR'
}

exports.setupLanguage = function(){
    lang = {}

    // Base fallback.
    exports.loadLanguage('en_US')

    const selectedLanguage = getConfiguredLanguage()
    if(selectedLanguage !== 'en_US'){
        try {
            exports.loadLanguage(selectedLanguage)
        } catch(_err) {
            exports.loadLanguage('ko_KR')
        }
    }

    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}
