// KTZ patch: open the full-screen KTZ server select view from the existing landing server label.
// This keeps the original launch flow intact and only changes the server-change entry point.

function ktzLandingLanguage(){
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

function ktzLandingText(key){
    const lang = ktzLandingLanguage()
    const text = {
        ko_KR: {
            serverSelect: '서버 선택하기',
            serverSelectTitle: '서버 선택 화면 열기',
            globalNews: '전체공지'
        },
        ja_JP: {
            serverSelect: 'サーバー選択',
            serverSelectTitle: 'サーバー選択画面を開く',
            globalNews: '全体お知らせ'
        },
        en_US: {
            serverSelect: 'Select Server',
            serverSelectTitle: 'Open server selection screen',
            globalNews: 'Global'
        }
    }
    return (text[lang] || text.ko_KR)[key]
}

function ktzLocalizedServerName(rawServer){
    const lang = ktzLandingLanguage()
    const names = {
        ko_KR: {
            kato_empire_official: '카토제국 공식서버',
            kato_empire_test: '카토제국 테스트 서버',
            city_ability: '도시능력자'
        },
        ja_JP: {
            kato_empire_official: 'カト帝国 公式サーバー',
            kato_empire_test: 'カト帝国 テストサーバー',
            city_ability: '都市能力者'
        },
        en_US: {
            kato_empire_official: 'Kato Empire Official',
            kato_empire_test: 'Kato Empire Test',
            city_ability: 'City Ability'
        }
    }
    return names[lang]?.[rawServer.id] || names.ko_KR[rawServer.id] || rawServer.ktz?.shortName || rawServer.name || rawServer.id
}

async function ktzApplyLandingBackground(){
    try {
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(ConfigManager.getSelectedServer()) || distro.getMainServer()

        if(server == null){
            return
        }

        const meta = server.rawServer.ktz || {}
        const background = meta.landingBackground || meta.background || server.rawServer.icon

        if(background != null){
            document.body.style.backgroundImage = `url('${background}')`
            document.body.style.backgroundSize = 'cover'
            document.body.style.backgroundPosition = 'center center'
        }
    } catch(err) {
        console.error('Unable to apply KTZ landing background.', err)
    }
}

function ktzBindLandingServerSelectButton(){
    const button = document.getElementById('server_selection_button')
    if(button == null){
        return
    }

    button.innerHTML = ktzLandingText('serverSelect')
    button.title = ktzLandingText('serverSelectTitle')
    button.onclick = async e => {
        e.target.blur()
        await ktzShowServerSelect(VIEWS.landing)
    }
}

setTimeout(() => {
    ktzBindLandingServerSelectButton()
    ktzApplyLandingBackground()
}, 0)

// The original launcher updates this button text whenever the selected server changes.
// Keep the KTZ label stable and keep the landing background synced.
setInterval(() => {
    ktzBindLandingServerSelectButton()
    if(getCurrentView() === VIEWS.landing){
        ktzApplyLandingBackground()
    }
}, 1000)

async function ktzFetchNewsFeed(newsFeed, label){
    if(!newsFeed){
        return []
    }

    return await new Promise((resolve) => {
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                    const el = $(items[i])
                    const rawDate = el.find('pubDate').text()
                    const parsedDate = new Date(rawDate)
                    const date = parsedDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    let content = el.find('content\\:encoded').text() || el.find('description').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text() || label || 'KTZ'

                    if(label){
                        title = `[${label}] ${title}`
                    }

                    articles.push({
                        link,
                        title,
                        date,
                        rawDate: parsedDate.getTime(),
                        author,
                        content,
                        comments,
                        commentsLink: link + '#comments'
                    })
                }

                resolve(articles)
            },
            timeout: 2500
        }).catch(() => {
            resolve([])
        })
    })
}

// Override original loadNews(): NEWS displays global news plus selected-server news.
loadNews = async function(){
    const distroData = await DistroAPI.getDistribution()
    const selectedServer = distroData.getServerById(ConfigManager.getSelectedServer()) || distroData.getMainServer()
    const globalNews = distroData.rawDistribution.ktz?.globalNews || distroData.rawDistribution.rss
    const serverNews = selectedServer?.rawServer?.ktz?.news
    const serverName = selectedServer?.rawServer != null ? ktzLocalizedServerName(selectedServer.rawServer) : null

    const globalArticles = await ktzFetchNewsFeed(globalNews, ktzLandingText('globalNews'))
    const serverArticles = await ktzFetchNewsFeed(serverNews, serverName)
    const articles = [...globalArticles, ...serverArticles]

    articles.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0))

    return { articles }
}
