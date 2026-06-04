// KTZ patch: open the full-screen KTZ server select view from the existing landing server label.
// This keeps the original launch flow intact and only changes the server-change entry point.

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

    button.innerHTML = '서버 선택하기'
    button.title = '서버 선택 화면 열기'
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
    const serverName = selectedServer?.rawServer?.ktz?.shortName || selectedServer?.rawServer?.name

    const globalArticles = await ktzFetchNewsFeed(globalNews, '전체공지')
    const serverArticles = await ktzFetchNewsFeed(serverNews, serverName)
    const articles = [...globalArticles, ...serverArticles]

    articles.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0))

    return { articles }
}
