/* Additive KTZ shell: the original account, launch and settings controls stay live. */
;(() => {
    const fs = require('fs-extra')
    const path = require('path')
    const strings = {
        ko_KR: {
            home: '홈', library: '라이브러리', skins: '스킨', settings: '설정', support: '지원', account: '계정 관리',
            heroDescription: '별빛이 머무는 곳, 우리의 이야기가 시작돼요.', autoConnect: '서버 바로 접속',
            autoUpdateHint: '필요한 파일은 실행 전에 자동으로 확인해요.', news: '새로운 소식',
            newsLoading: '소식을 불러오고 있어요.', newsEmpty: '아직 등록된 소식이 없어요.',
            newsFailed: '소식을 불러오지 못했어요. 새로고침으로 다시 시도할 수 있어요.', needHelp: '실행에 문제가 있나요?',
            libraryDescription: '나의 서버와 설치된 클라이언트를 한곳에서 관리해요.', refresh: '새로고침',
            packDescription: '모드, 리소스팩, 쉐이더와 이모트까지. 접속에 필요한 환경을 함께 준비해요.',
            play: '플레이', openFolder: '폴더 열기', myEnvironment: '내 플레이 환경', packVersion: '설치된 팩',
            memory: '최대 메모리', launcherVersion: '런처 버전',
            libraryHint: '플레이를 누르면 배포된 업데이트를 자동으로 확인해요. 개인 음성채팅과 외형 숨김 설정은 유지돼요.',
            repairPack: '팩 검사 / 복구', supportTitle: '도움이 필요하신가요?',
            supportDescription: '로그 확인부터 파일 복구까지, 필요한 도구를 모았어요.', diagnostics: '진단 및 복구',
            beforeRepair: '복구하기 전에', helpStep1: 'Minecraft를 완전히 종료해주세요.',
            helpStep2: '게임 로그 또는 오류 정보를 확인해주세요.', helpStep3: '파일 문제가 있다면 팩 재설치 후 다시 플레이해주세요.',
            helpWarning: '팩 재설치는 다음 실행 시 진행돼요. 플레이 중에는 복구와 초기화를 사용할 수 없어요.',
            gameLogs: 'Minecraft 로그 폴더 열기', readOriginal: '원문 보기 ↗',
            loginSubtitle: '에스터베일의 다음 이야기를 함께해요.', loginFootnote: 'Minecraft Java Edition 계정이 필요해요.',
            installed: '설치됨', notInstalled: '첫 실행 시 설치', unreadable: '설치 정보 확인 필요',
            revision: '라이브 패치', preparing: '준비 중', running: '게임 실행 중',
            missingFolder: '아직 폴더가 없어요. 게임을 실행한 뒤 다시 확인해주세요.',
            invalidSettings: '잘못 입력된 설정을 먼저 확인해주세요.', actionFailed: '요청을 완료하지 못했어요. 지원에서 로그를 확인해주세요.',
            close: '닫기', website: '홈페이지', updateReady: '런처 업데이트 확인', unknown: '확인 중'
        },
        en_US: {
            home: 'Home', library: 'Library', skins: 'Skins', settings: 'Settings', support: 'Support', account: 'Accounts',
            heroDescription: 'Where the starlight stays, our next story begins.', autoConnect: 'Join server directly',
            autoUpdateHint: 'Required files are checked before you play.', news: 'Latest news',
            newsLoading: 'Loading news…', newsEmpty: 'No news has been posted yet.',
            newsFailed: 'News could not be loaded. Refresh to try again.', needHelp: 'Need help getting started?',
            libraryDescription: 'Your server and installed client, all in one place.', refresh: 'Refresh',
            packDescription: 'Mods, resource packs, shaders and emotes — ready for your next adventure.',
            play: 'Play', openFolder: 'Open folder', myEnvironment: 'Your setup', packVersion: 'Installed pack',
            memory: 'Maximum memory', launcherVersion: 'Launcher version',
            libraryHint: 'Play automatically checks for published updates. Your voice chat and appearance preferences are preserved.',
            repairPack: 'Check / repair pack', supportTitle: 'How can we help?',
            supportDescription: 'Find your logs, diagnose problems and repair files.', diagnostics: 'Diagnostics & recovery',
            beforeRepair: 'Before you repair', helpStep1: 'Close Minecraft completely.',
            helpStep2: 'Check the game logs or copy diagnostic information.', helpStep3: 'For file problems, reinstall the pack and play again.',
            helpWarning: 'Reinstallation starts on the next launch. Repair and reset are disabled while playing.',
            gameLogs: 'Open Minecraft logs', readOriginal: 'Read original ↗',
            loginSubtitle: 'Be part of the next Aster Vale story.', loginFootnote: 'A Minecraft Java Edition account is required.',
            installed: 'Installed', notInstalled: 'Install on first play', unreadable: 'Check installation state',
            revision: 'Live patch', preparing: 'Preparing', running: 'Game running',
            missingFolder: 'This folder does not exist yet. Launch the game first.',
            invalidSettings: 'Please correct the invalid settings first.', actionFailed: 'The action failed. Check your logs in Support.',
            close: 'Close', website: 'Website', updateReady: 'Check launcher update', unknown: 'Checking'
        },
        ja_JP: {
            home: 'ホーム', library: 'ライブラリ', skins: 'スキン', settings: '設定', support: 'サポート', account: 'アカウント管理',
            heroDescription: '星明かりがとどまる場所で、私たちの物語が始まります。', autoConnect: 'サーバーに直接接続',
            autoUpdateHint: 'プレイ前に必要なファイルを自動確認します。', news: '最新のお知らせ',
            newsLoading: 'お知らせを読み込み中…', newsEmpty: 'お知らせはまだありません。',
            newsFailed: '読み込めませんでした。更新して再試行してください。', needHelp: '起動にお困りですか？',
            libraryDescription: 'サーバーとインストール済みクライアントを管理します。', refresh: '更新',
            packDescription: 'MOD、リソースパック、シェーダー、エモート。冒険に必要な環境をまとめて準備します。',
            play: 'プレイ', openFolder: 'フォルダーを開く', myEnvironment: 'プレイ環境', packVersion: 'インストール済みパック',
            memory: '最大メモリ', launcherVersion: 'ランチャーバージョン',
            libraryHint: 'プレイ時に公開された更新を自動確認します。ボイスチャットや外見の個人設定は保持されます。',
            repairPack: 'パック確認 / 修復', supportTitle: 'お手伝いします',
            supportDescription: 'ログの確認からファイルの修復まで、必要なツールをまとめました。', diagnostics: '診断と修復',
            beforeRepair: '修復する前に', helpStep1: 'Minecraftを完全に終了してください。',
            helpStep2: 'ゲームログやエラー情報を確認してください。', helpStep3: 'ファイルの問題はパックを再インストールしてお試しください。',
            helpWarning: '再インストールは次回の起動時に行われます。プレイ中は修復や初期化を使用できません。',
            gameLogs: 'Minecraftのログを開く', readOriginal: '元の記事を見る ↗',
            loginSubtitle: 'アスターヴェイルの次の物語へ。', loginFootnote: 'Minecraft Java Editionアカウントが必要です。',
            installed: 'インストール済み', notInstalled: '初回起動時にインストール', unreadable: 'インストール情報の確認が必要',
            revision: 'ライブパッチ', preparing: '準備中', running: 'ゲーム実行中',
            missingFolder: 'フォルダーはまだありません。ゲーム起動後に確認してください。',
            invalidSettings: '正しくない設定を修正してください。', actionFailed: '操作に失敗しました。サポートからログを確認してください。',
            close: '閉じる', website: 'ウェブサイト', updateReady: 'ランチャー更新を確認', unknown: '確認中'
        }
    }
    const locale = typeof ktzGetLanguage === 'function' ? ktzGetLanguage() : 'ko_KR'
    const t = key => (strings[locale] || strings.ko_KR)[key] || strings.ko_KR[key] || key
    const byId = id => document.getElementById(id)
    const routes = { home: VIEWS.landing, library: VIEWS.library, skins: VIEWS.skins, settings: VIEWS.settings, support: VIEWS.support }
    let navigating = false
    let refreshId = 0
    let articles = null
    let toastTimer

    function toast(message){
        clearTimeout(toastTimer)
        byId('ktzToast').textContent = message
        byId('ktzToast').hidden = false
        toastTimer = setTimeout(() => { byId('ktzToast').hidden = true }, 4500)
    }

    function run(action){
        return async () => {
            try { await action() } catch(err) {
                console.warn('[KTZ Shell] Action failed.', err)
                toast(t('actionFailed'))
            }
        }
    }

    function busy(){
        return window.ktzLaunchState != null && window.ktzLaunchState !== 'idle'
    }

    function syncLaunchState(){
        const state = window.ktzLaunchState || 'idle'
        byId('ktzLibraryPlay').disabled = busy() || byId('launch_button').disabled
        byId('ktzLibraryPlay').textContent = t(state === 'starting' ? 'preparing' : state === 'running' ? 'running' : 'play')
        byId('ktzAutoConnect').disabled = busy()
        for(const id of ['ktzRepairFiles', 'ktzReinstallAsterValePack', 'ktzResetCache']){
            if(byId(id)) byId(id).disabled = busy()
        }
    }

    function syncView(view = getCurrentView()){
        const protectedView = Object.values(routes).includes(view) || view === KTZ_SERVER_SELECT_VIEW
        const authenticated = protectedView && ConfigManager.getSelectedAccount() != null
        document.body.dataset.ktzAuthenticated = String(authenticated)
        byId('ktzNavigation').hidden = !authenticated
        for(const button of document.querySelectorAll('[data-ktz-page]')){
            if(routes[button.dataset.ktzPage] === view) button.setAttribute('aria-current', 'page')
            else button.removeAttribute('aria-current')
        }
        byId('ktzAutoConnect').checked = ConfigManager.getAutoConnect()
        if(view === VIEWS.library) refreshLibrary()
        if(view === VIEWS.support) ktzInjectSupportTools()
        syncLaunchState()
    }

    async function navigate(page, settingsTab = null){
        if(navigating || !routes[page] || ConfigManager.getSelectedAccount() == null) return false
        const current = getCurrentView()
        if(!current) return false
        if(current === VIEWS.settings && byId('settingsNavDone').disabled){
            toast(t('invalidSettings'))
            return false
        }
        navigating = true
        try {
            if(current === VIEWS.settings && routes[page] !== current) fullSettingsSave()
            if(page === 'settings'){
                if(current !== VIEWS.settings) await prepareSettings()
                if(settingsTab){
                    const tab = document.querySelector(`[rSc="${settingsTab}"]`)
                    if(tab) settingsNavItemListener(tab, false)
                }
            }
            if(current !== routes[page]){
                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                await new Promise(resolve => switchView(current, routes[page], reducedMotion ? 0 : 120, reducedMotion ? 0 : 160, () => {}, resolve))
            }
            syncView()
            return true
        } finally {
            navigating = false
        }
    }

    async function selectedServer(){
        const distro = await DistroAPI.getDistribution()
        return distro.getServerById(ConfigManager.getSelectedServer())
    }

    async function refreshLibrary(){
        const requestId = ++refreshId
        try {
            const server = await selectedServer()
            if(!server || requestId !== refreshId) return
            const raw = server.rawServer
            const name = typeof ktzLocalizedServerName === 'function' ? ktzLocalizedServerName(raw) : raw.name
            byId('ktzHeroName').textContent = name || raw.name
            byId('ktzLibraryName').textContent = name || raw.name
            byId('ktzHeroVersion').textContent = `Minecraft ${raw.minecraftVersion}`
            byId('ktzLibraryGameVersion').textContent = `Minecraft ${raw.minecraftVersion}`
            // Java defaults are resolved asynchronously by the existing startup flow.
            try { byId('ktzMemoryValue').textContent = ConfigManager.getMaxRAM(raw.id) || '—' }
            catch(_err) { byId('ktzMemoryValue').textContent = t('unknown') }
            let state = null
            let stateFailed = false
            try {
                state = await fs.readJson(path.join(ConfigManager.getInstanceDirectory(), raw.id, '.ktz-pack-state.json'))
            } catch(err) {
                stateFailed = err.code !== 'ENOENT'
            }
            if(requestId !== refreshId) return
            const installed = typeof state?.installedVersion === 'string' && state.installedVersion.length > 0
            byId('ktzPackInstalled').textContent = t(stateFailed ? 'unreadable' : installed ? 'installed' : 'notInstalled')
            byId('ktzInstalledVersion').textContent = installed ? state.installedVersion : '—'
            byId('ktzPackRevision').textContent = `${t('revision')} ${installed ? Number(state.livePatchRevision || 0) : '—'}`
        } catch(err) {
            console.warn('[KTZ Shell] Unable to read pack state.', err)
            byId('ktzPackInstalled').textContent = t('unreadable')
        }
    }

    async function openInstanceFolder(child = ''){
        const id = ConfigManager.getSelectedServer()
        if(!id) return
        const instanceRoot = path.resolve(ConfigManager.getInstanceDirectory())
        const target = path.resolve(instanceRoot, id, child)
        const relative = path.relative(instanceRoot, target)
        if(relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid instance path')
        if(!await fs.pathExists(target)) return toast(t('missingFolder'))
        const error = await shell.openPath(target)
        if(error) throw new Error(error)
    }

    function textFromHTML(value){
        const doc = new DOMParser().parseFromString(String(value || ''), 'text/html')
        doc.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove())
        doc.querySelectorAll('br').forEach(node => node.replaceWith('\n'))
        doc.querySelectorAll('p,div,li,h1,h2,h3,h4').forEach(node => node.append('\n'))
        return doc.body.textContent.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    }

    function safeWebURL(value){
        try {
            const url = new URL(String(value))
            return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
        } catch(_err) { return null }
    }

    function articleDate(article){
        const value = article.rawDate || article.date
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString(locale.replace('_', '-'), { year: 'numeric', month: '2-digit', day: '2-digit' })
    }

    function showArticle(article){
        byId('ktzDialogTitle').textContent = textFromHTML(article.title)
        byId('ktzDialogDate').textContent = articleDate(article)
        byId('ktzDialogBody').textContent = textFromHTML(article.content)
        const href = safeWebURL(article.link)
        byId('ktzDialogLink').hidden = !href
        byId('ktzDialogLink').href = href || '#'
        if(!byId('ktzNewsDialog').open) byId('ktzNewsDialog').showModal()
    }

    function renderNews(items){
        articles = Array.isArray(items) ? items : null
        const list = byId('ktzNewsList')
        list.replaceChildren()
        if(!articles?.length){
            const empty = document.createElement('p')
            empty.className = 'ktzEmpty'
            empty.textContent = t(articles == null ? 'newsFailed' : 'newsEmpty')
            list.append(empty)
            return
        }
        for(const article of articles.slice(0, 20)){
            const button = document.createElement('button')
            button.className = 'ktzNewsItem'
            const title = document.createElement('h3')
            title.textContent = textFromHTML(article.title)
            const summary = document.createElement('p')
            summary.textContent = textFromHTML(article.content).slice(0, 160)
            const date = document.createElement('time')
            date.textContent = articleDate(article)
            button.append(title, summary, date)
            button.addEventListener('click', () => showArticle(article))
            list.append(button)
        }
    }

    function mount(){
        if(byId('ktzDashboard')) return
        document.body.insertBefore(byId('ktzNavigation'), byId('main'))
        byId('landingContainer').append(byId('ktzHomeTemplate').content.cloneNode(true))
        for(const [id, slot] of [
            ['user_content', 'ktzAccountSlot'], ['image_seal_container', 'ktzUpdateSlot'],
            ['server_status_wrapper', 'ktzServerStatusSlot'], ['launch_content', 'ktzLaunchSlot'], ['launch_details', 'ktzLaunchSlot']
        ]) byId(slot).append(byId(id))

        document.querySelectorAll('[data-ktz-i18n]').forEach(node => { node.textContent = t(node.dataset.ktzI18n) })
        document.documentElement.lang = locale.replace('_', '-')
        for(const [id, label] of [['homeURL', t('website')], ['discordURL', 'Discord']]){
            const link = byId(id)
            if(link && safeWebURL(link.href)){
                link.removeAttribute('tabindex')
                const text = document.createElement('span')
                text.textContent = label
                link.append(text)
                link.title = label
                byId('ktzCommunityLinks').append(link)
            }
        }
        byId('avatarOverlay').setAttribute('aria-label', t('account'))
        byId('image_seal_container').setAttribute('aria-label', t('updateReady'))
        byId('launch_details').setAttribute('role', 'status')
        byId('launch_details').setAttribute('aria-live', 'polite')
        byId('ktzRefreshNews').title = t('refresh')
        byId('ktzRefreshNews').setAttribute('aria-label', t('refresh'))
        byId('ktzCloseNews').setAttribute('aria-label', t('close'))
        byId('ktzNewsDialog').setAttribute('aria-labelledby', 'ktzDialogTitle')
        const version = require('../package.json').version
        document.querySelectorAll('.ktzAppVersion').forEach(node => { node.textContent = version })
        if(byId('frameTitleText')) byId('frameTitleText').textContent = `KTZ Launcher  /  v${version}`

        for(const button of document.querySelectorAll('[data-ktz-page]')) button.onclick = run(() => navigate(button.dataset.ktzPage))
        byId('ktzBrandHome').onclick = event => { event.preventDefault(); run(() => navigate('home'))() }
        byId('ktzHeaderAccount').onclick = run(() => navigate('settings', 'settingsTabAccount'))
        byId('ktzHomeSupport').onclick = run(() => navigate('support'))
        byId('ktzLibraryRepair').onclick = run(() => navigate('support'))
        byId('ktzLibrarySettings').onclick = run(() => navigate('settings', 'settingsTabJava'))
        byId('ktzLibraryFolder').onclick = run(() => openInstanceFolder())
        byId('ktzOpenGameLogs').onclick = run(() => openInstanceFolder('logs'))
        byId('ktzLibraryRefresh').onclick = run(refreshLibrary)
        byId('ktzLibraryPlay').onclick = run(async () => {
            if(busy() || byId('launch_button').disabled) return
            if(await navigate('home')) byId('launch_button').click()
        })
        byId('ktzAutoConnect').checked = ConfigManager.getAutoConnect()
        byId('ktzAutoConnect').onchange = () => {
            if(busy()) return
            ConfigManager.setAutoConnect(byId('ktzAutoConnect').checked)
            ConfigManager.save()
        }
        byId('ktzRefreshNews').onclick = run(async () => {
            byId('ktzRefreshNews').disabled = true
            try { await initNews() } finally { byId('ktzRefreshNews').disabled = false }
        })
        byId('ktzCloseNews').onclick = () => byId('ktzNewsDialog').close()
        byId('newsButton').onclick = () => { if(articles?.length) showArticle(articles[0]) }

        document.addEventListener('ktz:view-changed', event => syncView(event.detail.view))
        document.addEventListener('ktz:account-changed', () => syncView())
        document.addEventListener('ktz:server-changed', () => { refreshLibrary(); syncLaunchState() })
        document.addEventListener('ktz:launch-state', () => { syncLaunchState(); if(!busy()) refreshLibrary() })
        document.addEventListener('ktz:news', event => renderNews(event.detail.articles))
        new MutationObserver(syncLaunchState).observe(byId('launch_button'), { attributes: true, attributeFilter: ['disabled'] })
        const statusObserver = new MutationObserver(() => {
            byId('ktzServerStatusSlot').dataset.online = String(/^\s*\d+\s*\//.test(byId('player_count').textContent))
        })
        statusObserver.observe(byId('player_count'), { childList: true, characterData: true, subtree: true })
        ktzInjectSupportTools()
        syncView()
        refreshLibrary()
    }

    // Test/debug API contains only renderer actions, never tokens or account data.
    window.ktzShell = { navigate, refreshLibrary, renderNews, textFromHTML, safeWebURL }
    mount()
})()
