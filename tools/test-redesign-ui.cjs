// Hidden Electron integration test with an isolated, disposable profile.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const fs = require('fs-extra')
const path = require('path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('url')
const root = path.resolve(process.env.KTZ_UI_APP_ROOT || path.join(__dirname, '..'))
const runRoot = path.join('C:/codex/Temp/ktz-redesign-ui', `run-${Date.now()}`)
const out = path.resolve(process.env.KTZ_UI_OUTPUT || 'C:/codex/Builds/ktz-redesign-20260924/previews')
const locale = process.env.KTZ_UI_LOCALE || 'ko_KR'
const profile = path.join(runRoot, 'roaming', 'KTZ Launcher')
const gameRoot = path.join(runRoot, 'game-data')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
const checks = []
let win

if(!out.toLowerCase().startsWith('c:\\codex\\')) throw new Error('Test output must be under C:\\codex')
fs.ensureDirSync(profile)
fs.ensureDirSync(out)
fs.ensureDirSync(path.join(runRoot, 'temp'))
process.env.ELECTRON_IS_DEV = '1'
process.env.APPDATA = path.join(runRoot, 'roaming')
process.env.LOCALAPPDATA = path.join(runRoot, 'local')
process.env.TEMP = process.env.TMP = path.join(runRoot, 'temp')
app.setPath('userData', profile)
app.setPath('temp', process.env.TEMP)
app.disableHardwareAcceleration()
fs.writeJsonSync(path.join(profile, 'config.json'), {
    settings: { game: { resWidth: 1280, resHeight: 720, fullscreen: false, autoConnect: true, launchDetached: true }, launcher: { allowPrerelease: false, dataDirectory: gameRoot, language: locale } },
    ktz: { firstRunGuideHidden: true }, selectedServer: 'astervale', selectedAccount: null,
    authenticationDatabase: {}, modConfigurations: [], javaConfig: {},
    newsCache: { date: null, content: null, dismissed: false }
})
const distro = fs.readJsonSync(path.join(root, 'distribution.json'))
distro.rss = null
if(distro.ktz) distro.ktz.globalNews = null
for(const server of distro.servers){
    server.address = '127.0.0.1:1'
    if(server.ktz){ server.ktz.news = null; server.ktz.rss = null }
}
fs.writeJsonSync(path.join(profile, 'distribution_dev.json'), distro)
const remote = require('@electron/remote/main')
remote.initialize()
const ejs = require('ejs-electron')
const Lang = require(path.join(root, 'app/assets/js/langloader'))
Lang.setupLanguage()
ejs.data('bkid', 0)
ejs.data('lang', (key, args) => Lang.queryEJS(key, args))
let pendingDistribution
let pageLoaded = false
ipcMain.on('distributionIndexDone', (event, res) => {
    pendingDistribution = res
    if(pageLoaded) event.sender.send('distributionIndexDone', res)
})
app.on('window-all-closed', () => {})
const execute = code => win.webContents.executeJavaScript(code, true)
const check = (name, passed) => { assert.ok(passed, name); checks.push(name) }
async function capture(name){
    win.webContents.invalidate()
    await sleep(300)
    const png = await win.webContents.capturePage()
    fs.writeFileSync(path.join(out, `${name}-${locale}.png`), png.toPNG())
    const state = await execute("({view: getCurrentView(), size:[innerWidth,innerHeight], active:Array.from(document.querySelectorAll('[data-ktz-page][aria-current]')).map(n=>n.dataset.ktzPage)})")
    fs.writeJsonSync(path.join(out, `${name}-${locale}.json`), state, { spaces: 2 })
}
async function waitFor(code, timeout = 20000){
    const started = Date.now()
    let lastError = null
    while(Date.now() - started < timeout){
        if(await execute(code).catch(err => { lastError = err.message; return false })) return
        await sleep(100)
    }
    const state = await execute("({shell:typeof window.ktzShell, view: typeof getCurrentView==='function' ? getCurrentView():null, loading: getComputedStyle(document.getElementById('loadingContainer')).display})").catch(err => err.message)
    throw new Error(`Timed out: ${code}; error=${lastError}; state=${JSON.stringify(state)}`)
}
async function test(){
    // Block external UI requests. No real login, game process, server or download is invoked.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
    win = new BrowserWindow({ width: 1280, height: 800, show: false, frame: false, backgroundColor: '#0b0e14', webPreferences: {
        nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, offscreen: true, preload: path.join(__dirname, 'ui-test-preload.cjs')
    } })
    remote.enable(win.webContents)
    win.webContents.on('console-message', details => {
        if(['warning', 'error'].includes(details.level) && !/net::ERR_BLOCKED|Electron Security Warning/.test(details.message)) errors.push(details.message)
    })
    await win.loadURL(pathToFileURL(path.join(root, 'app/app.ejs')).href)
    // Hidden native windows do not consistently advance jQuery animation frames.
    await execute('$.fx.off = true')
    pageLoaded = true
    if(pendingDistribution !== undefined) win.webContents.send('distributionIndexDone', pendingDistribution)
    await waitFor("typeof ktzShell !== 'undefined' && getCurrentView() === VIEWS.loginOptions && getComputedStyle(document.getElementById('loadingContainer')).display === 'none'")
    check('Unauthenticated navigation is hidden', await execute("document.getElementById('ktzNavigation').hidden"))
    check('Microsoft login handler retained', await execute("typeof document.getElementById('loginOptionMicrosoft').onclick === 'function'"))
    await capture('login')
    await execute(`(() => {
        const a = ConfigManager.addMicrosoftAuthAccount('00000000000000000000000000000000', 'TEST-NOT-A-TOKEN', 'KTZ_Traveler', 0, '', '', 0);
        ConfigManager.save(); updateSelectedAccount(a);
        ktzServerSelectShownThisSession = true;
        switchView(getCurrentView(), VIEWS.landing, 0, 0);
    })()`)
    await waitFor("document.body.dataset.ktzAuthenticated === 'true'")
    check('Original Play node retained once', await execute("document.querySelectorAll('#launch_button').length === 1 && document.getElementById('ktzLaunchSlot').contains(document.getElementById('launch_button'))"))
    check('Original launch guard is installed', await execute("document.getElementById('launch_button').hasAttribute('ktz-launch-guard')"))
    await execute("ktzShell.renderNews([{title: '새로운 KTZ Launcher를 만나보세요', date: '2026-09-24', content: '<p>화면 테스트용 예시 공지입니다.</p><p>홈, 라이브러리, 지원 도구를 더 편하게 이용해요.</p>', link: 'https://github.com/Katozarasi/KTZ-Launcher'}, {title: '내 설정은 그대로, 더 편리하게', date: '2026-09-24', content: '음성채팅과 외형 숨김 등 개인 설정을 유지하는 기존 업데이트 흐름을 사용해요.', link: 'https://github.com/Katozarasi/KTZ-Launcher'}])")
    await capture('home')
    check('Account label does not overlap the avatar', await execute("document.getElementById('user_text').getBoundingClientRect().left > document.getElementById('avatarContainer').getBoundingClientRect().right"))
    check('Home Play is within viewport', await execute("(() => {const r=document.getElementById('launch_button').getBoundingClientRect();return r.y>110 && r.bottom<innerHeight && r.width>0})()"))
    await execute('ktzShowServerSelect(VIEWS.landing)')
    check('Server selector only exposes Aster Vale', await execute("Array.from(document.querySelectorAll('.ktzServerCard')).every(el=>el.dataset.serverId==='astervale') && document.querySelectorAll('.ktzServerCard').length===1"))
    await capture('server-selection')
    await execute("document.getElementById('ktzServerSelectConfirm').onclick()")
    check('Server selection returns to home', await execute('getCurrentView() === VIEWS.landing'))
    await execute("ktzShell.navigate('library')")
    check('Library route active', await execute("getCurrentView() === VIEWS.library"))
    await capture('library-first-install')
    fs.ensureDirSync(path.join(gameRoot, 'instances/astervale'))
    fs.writeJsonSync(path.join(gameRoot, 'instances/astervale/.ktz-pack-state.json'), { installedVersion: 'TEST-1.3.6', livePatchRevision: 17 })
    await execute('ktzShell.refreshLibrary()')
    check('Library reads real fixture state', await execute("document.getElementById('ktzInstalledVersion').textContent === 'TEST-1.3.6'"))
    await capture('library')
    await execute("ktzShell.navigate('skins')")
    await waitFor("document.getElementById('ktzSkinPlayerName').textContent === 'KTZ_Traveler' && !document.getElementById('ktzSkinChoose').disabled")
    check('Skin tab loads the selected profile', await execute("getCurrentView() === VIEWS.skins && !document.getElementById('ktzSkinCurrentCanvas').hidden"))
    check('Only owned capes plus no-cape option are displayed', await execute("document.querySelectorAll('.ktzCapeCard').length === 3 && document.getElementById('ktzSkinCapeCount').textContent === '2'"))
    await capture('skins')
    win.setSize(1280, 1000)
    await sleep(150)
    await capture('skins-overview')
    win.setSize(1280, 800)
    await sleep(150)
    await execute("document.getElementById('ktzSkinBack').click()")
    check('Back view can be selected', await execute("document.getElementById('ktzSkinBack').getAttribute('aria-pressed') === 'true'"))
    await capture('skins-back')
    await execute("document.getElementById('ktzSkinFront').click()")
    check('Opening skin tab makes no cosmetic changes', await execute("ktzSkinTest.calls.every(c=>c.method === 'GET')"))
    await execute(`(async () => {
        const data = new DataTransfer();
        data.items.add(new File([ktzSkinTest.png()], 'test-preview.png', {type:'image/png'}));
        document.getElementById('ktzSkinFile').files=data.files;
        await document.getElementById('ktzSkinFile').onchange();
        document.querySelector('input[name="ktzSkinVariant"][value="slim"]').click();
    })()`)
    check('Valid PNG gives a preview without uploading', await execute("!document.getElementById('ktzSkinUploadPreview').hidden && ktzSkinTest.calls.every(c=>c.method === 'GET')"))
    await capture('skins-upload-preview')
    await execute("document.getElementById('ktzSkinApply').click()")
    check('Upload requires confirmation with account and model', await execute("document.getElementById('ktzSkinConfirm').open && document.getElementById('ktzSkinConfirmDetail').textContent.includes('KTZ_Traveler')"))
    await capture('skins-confirm')
    await execute("document.getElementById('ktzSkinConfirmCancel').click()")
    check('Cancelling confirmation does not upload', await execute("ktzSkinTest.calls.every(c=>c.method === 'GET')"))
    await execute("document.getElementById('ktzSkinApply').click();document.getElementById('ktzSkinConfirmApply').onclick()")
    check('Confirmed PNG uploads once and refreshes slim profile', await execute("ktzSkinTest.calls.filter(c=>c.method === 'POST').length === 1 && ktzSkinTest.state.skins[0].variant === 'SLIM' && document.getElementById('ktzSkinUploadPreview').hidden"))
    await execute("document.querySelectorAll('.ktzCapeCard')[2].click();document.getElementById('ktzSkinApplyCape').click();document.getElementById('ktzSkinConfirmApply').onclick()")
    check('Owned cape can be applied after confirmation', await execute("ktzSkinTest.state.capes[1].state === 'ACTIVE' && ktzSkinTest.calls.filter(c=>c.method==='PUT').length === 1"))
    await execute("document.querySelectorAll('.ktzCapeCard')[0].click();document.getElementById('ktzSkinApplyCape').click();document.getElementById('ktzSkinConfirmApply').onclick()")
    check('No cape removes only the equipped cape', await execute("ktzSkinTest.state.capes.every(c=>c.state === 'INACTIVE') && ktzSkinTest.state.skins.length === 1"))
    await execute(`(async () => {
        const data = new DataTransfer();data.items.add(new File(['not a png'],'bad.png',{type:'image/png'}));
        document.getElementById('ktzSkinFile').files=data.files;
        await document.getElementById('ktzSkinFile').onchange();
    })()`)
    check('Invalid PNG cannot be uploaded', await execute("document.getElementById('ktzSkinApply').disabled && document.getElementById('ktzSkinStatus').dataset.error === 'true'"))
    await execute("window.ktzLaunchState='starting';document.dispatchEvent(new CustomEvent('ktz:launch-state'))")
    check('Skin changes are disabled while launching a game', await execute("['ktzSkinChoose','ktzSkinReset','ktzSkinApplyCape'].every(id=>document.getElementById(id).disabled)"))
    await execute("window.ktzLaunchState='idle';document.dispatchEvent(new CustomEvent('ktz:launch-state'));document.getElementById('ktzSkinReset').click();document.getElementById('ktzSkinConfirmApply').onclick()")
    check('Reset restores default through skin endpoint', await execute("ktzSkinTest.state.skins.length === 0 && ktzSkinTest.calls.some(c=>c.method==='DELETE' && c.url.endsWith('/skins/active'))"))
    await capture('skins-default')
    await execute("ktzSkinTest.fail(401);document.getElementById('ktzSkinRefresh').onclick()")
    check('Expired session shows safe error and disables edits', await execute("document.getElementById('ktzSkinStatus').dataset.error === 'true' && document.getElementById('ktzSkinChoose').disabled && !document.getElementById('ktzSkinStatus').textContent.includes('TOKEN')"))
    await capture('skins-login-required')
    await execute("ktzSkinTest.fail(200);document.getElementById('ktzSkinRefresh').onclick()")
    await execute("ktzShell.navigate('support')")
    check('Support tools mounted in dedicated tab', await execute("document.getElementById('ktzSupportHost').contains(document.getElementById('ktzCopySupportInfo'))"))
    await capture('support')
    await execute("window.ktzLaunchState='starting';document.dispatchEvent(new CustomEvent('ktz:launch-state'))")
    check('Repair and secondary Play disabled during preparation', await execute("['ktzRepairFiles','ktzReinstallAsterValePack','ktzResetCache','ktzLibraryPlay','ktzAutoConnect'].every(id=>document.getElementById(id).disabled)"))
    check('Direct repair handler rejects busy state', await execute("(() => {const old=window.alert;window.alert=()=>{};try{return !ktzSupportCanRepair()}finally{window.alert=old}})()"))
    await execute("window.ktzLaunchState='idle';document.dispatchEvent(new CustomEvent('ktz:launch-state'))")
    await execute("ktzShell.navigate('settings', 'settingsTabMinecraft')")
    check('Settings route visible', await execute("getCurrentView() === VIEWS.settings && getComputedStyle(document.getElementById('settingsContainer')).display !== 'none'"))
    await capture('settings')
    await execute("document.getElementById('settingsNavDone').disabled=true;ktzShell.navigate('home')")
    check('Invalid settings block navigation', await execute("getCurrentView() === VIEWS.settings"))
    await execute("document.getElementById('settingsNavDone').disabled=false;ktzShell.navigate('home')")
    check('Valid settings save and leave', await execute("getCurrentView() === VIEWS.landing"))
    check('Auto-connect toggle persists', await execute("(() => {const el=document.getElementById('ktzAutoConnect');el.click();return ConfigManager.getAutoConnect() === false})()"))
    await execute("document.getElementById('ktzAutoConnect').click()")
    check('Unsafe news URLs rejected', await execute("ktzShell.safeWebURL('javascript:alert(1)') === null && ktzShell.safeWebURL('file:///C:/Windows') === null && ktzShell.safeWebURL('https://example.com') === 'https://example.com/'"))
    check('RSS markup rendered as text', await execute("ktzShell.textFromHTML('<script>BAD</script><p>Hello <b>world</b></p>') === 'Hello world'"))
    await execute("ktzShell.renderNews([{title:'<img src=x onerror=alert(1)>Safe title',content:'<script>BAD</script><p>Safe article</p>',link:'javascript:alert(1)'}]);document.querySelector('.ktzNewsItem').click()")
    check('News modal has no executable elements or unsafe links', await execute("document.getElementById('ktzNewsDialog').open && document.getElementById('ktzDialogLink').hidden && !document.getElementById('ktzDialogBody').querySelector('script,img')"))
    await execute("document.getElementById('ktzNewsDialog').close();ktzShell.renderNews([])")
    await execute("document.getElementById('ktzToast').hidden = true")
    await capture('home-empty-news')
    win.setSize(980, 640)
    await sleep(200)
    await capture('home-compact')
    check('Compact Play remains on screen', await execute("(() => {const r=document.getElementById('launch_button').getBoundingClientRect();return r.bottom <= innerHeight && r.right <= innerWidth && r.y>0})()"))
    await execute("window.ktzLaunchState='starting';toggleLaunchArea(true);setLaunchPercentage(62);setLaunchDetails('에스터베일 클라이언트팩을 확인하고 있어요...');document.dispatchEvent(new CustomEvent('ktz:launch-state'))")
    await capture('launch-progress-compact')
    check('Compact launch progress remains on screen', await execute("document.getElementById('launch_details').getBoundingClientRect().bottom <= innerHeight"))
    check('Progress does not overlap auto-connect controls', await execute("document.getElementById('launch_details').getBoundingClientRect().bottom < document.querySelector('.ktzHeroOptions').getBoundingClientRect().top"))
    await execute('ktzUnlockLaunch()')
    await execute("ktzShell.navigate('support')")
    await capture('support-compact')
    await execute("ktzShell.navigate('skins')")
    await capture('skins-compact')
    check('Compact skin page scrolls without horizontal overflow', await execute("document.getElementById('ktzSkinsContainer').scrollWidth <= document.getElementById('ktzSkinsContainer').clientWidth"))
    await execute("document.getElementById('ktzSkinReset').click()")
    await execute("ConfigManager.removeAuthAccount('00000000000000000000000000000000');updateSelectedAccount(null);switchView(getCurrentView(),VIEWS.loginOptions,0,0)")
    check('Logout clears cosmetic data and pending confirmation', await execute("!document.getElementById('ktzSkinConfirm').open && document.querySelectorAll('.ktzCapeCard').length===0 && document.getElementById('ktzSkinPlayerName').textContent==='—'"))
    check('Logout hides authenticated navigation', await execute("document.getElementById('ktzNavigation').hidden"))
    await capture('login-compact')
    check('No fatal renderer errors', errors.every(message => !/Uncaught|Unable to load preload|Action failed|TypeError|ReferenceError/.test(message)))
    const result = { checks, errors, profile, appRoot: root, screenshots: out, locale, gameLaunched: false, productionProfileUsed: false }
    fs.writeJsonSync(path.join(out, `verification-${locale}.json`), result, { spaces: 2 })
    console.log(JSON.stringify(result, null, 2))
    app.exit(0)
}
app.whenReady().then(test).catch(async error => {
    console.error(error.stack)
    console.error(JSON.stringify(errors))
    if(win && !win.isDestroyed()) await capture('failure').catch(() => {})
    fs.writeJsonSync(path.join(out, `failure-${locale}.json`), { error: error.stack, errors, checks, profile }, { spaces: 2 })
    app.exit(1)
})
