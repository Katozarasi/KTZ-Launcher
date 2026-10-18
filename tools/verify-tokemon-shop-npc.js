const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const vm = require('vm')
const http = require('http')
const { createRequire } = require('module')
const { spawnSync } = require('child_process')
const AdmZip = require('adm-zip')
const { DistributionAPI, HeliosDistribution } = require('helios-core/common')
const { DistributionIndexProcessor, downloadFile } = require('helios-core/dl')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-ShopNPC-20261018'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (file, algorithm = 'sha256') => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const staging = read(path.join(work, 'staging.json'))
const inventory = read(path.join(root, 'docs/packs/tokemon-files.json'))
const before = read(path.join(staging.backup, 'distribution.json'))
const rawBase = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'
const remoteUrl = rawBase + 'distribution.json'
const published = process.argv.includes('--published')
const installLocal = process.argv.includes('--install-local')
assert.ok(!installLocal || published, '--install-local requires --published')
assert.equal(staging.changes.length, 1)
assert.equal(staging.changes[0].record.id, 'tokemon_shop')
assert.equal(staging.changes[0].record.version, '0.3.0')
const mode = published ? 'published' : 'staged'
const runRoot = path.join(work, mode + '-' + Date.now())
const loader = createRequire(path.join(root, 'package.json'))
const flatten = modules => modules.flatMap(module => [module, ...flatten(module.subModules)])
const changed = module => staging.changes.some(item => module.rawModule.id.startsWith(`ktz.tokemon:${item.record.id}:`))
const ensureParent = file => fs.mkdirSync(path.dirname(file), { recursive: true })

function builder(server, base) {
    const config = { getCommonDirectory: () => path.join(base, 'common'), getInstanceDirectory: () => path.join(base, 'instances'), getAutoConnect: () => true }
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(root, 'app/assets/js/processbuilder.js'), 'utf8'), {
        module, exports: module.exports, process, console, Buffer,
        require: id => id === './configmanager' ? config : loader(id)
    }, { filename: 'KTZ-ProcessBuilder.js' })
    const result = new module.exports(server, {}, {}, {}, require('../package.json').version)
    result.usingFabricLoader = true
    fs.mkdirSync(result.gameDir, { recursive: true })
    return result
}

function assertProtected() {
    for (const item of staging.protectedFiles) assert.equal(hash(item.file), item.sha256, 'User setting changed: ' + item.file)
    assert.deepEqual(read(path.join(root, 'admin/servers.json')), read(path.join(staging.backup, 'admin/servers.json')))
}

function assertRuntimeUntouched() {
    for (const item of staging.untouchedRuntimeFiles) assert.equal(hash(item.file), item.sha256, 'Actual launcher cache changed: ' + item.file)
}

async function seedOldPack(base) {
    const config = read('C:/Users/nabar/AppData/Roaming/KTZ Launcher/config.json')
    const old = new HeliosDistribution(before, path.join(base, 'common'), path.join(base, 'instances')).getServerById('tokemon')
    const actualRoot = config.settings.launcher.dataDirectory
    const actual = new HeliosDistribution(before, path.join(actualRoot, 'common'), path.join(actualRoot, 'instances')).getServerById('tokemon')
    const actualModules = new Map(flatten(actual.modules).map(module => [module.rawModule.id, module]))
    for (const module of flatten(old.modules)) {
        const artifact = module.rawModule.artifact
        const from = actualModules.get(module.rawModule.id).getPath()
        ensureParent(module.getPath())
        if (fs.existsSync(from) && hash(from, 'md5') === artifact.MD5) {
            // A separate copy keeps intentional corruption/repair checks isolated from the actual launcher cache.
            fs.copyFileSync(from, module.getPath(), fs.constants.COPYFILE_EXCL)
        } else if (artifact.url.startsWith(rawBase) && fs.existsSync(path.join(root, artifact.url.slice(rawBase.length)))) {
            fs.copyFileSync(path.join(root, artifact.url.slice(rawBase.length)), module.getPath())
        } else {
            const cached = 'C:/codex/Cache/KTZ-Launcher/tokemon-artifacts/' + artifact.MD5
            if (fs.existsSync(cached) && hash(cached, 'md5') === artifact.MD5) fs.copyFileSync(cached, module.getPath())
            else await downloadFile(artifact.url, module.getPath())
        }
        assert.equal(hash(module.getPath(), 'md5'), artifact.MD5, module.rawModule.id)
    }
    return old
}

async function localInstall() {
    const launcher = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
    const config = read(launcher + '/config.json')
    const data = config.settings.launcher.dataDirectory
    const api = new DistributionAPI(launcher, path.join(data, 'common'), path.join(data, 'instances'), remoteUrl, false)
    const distribution = await api.refreshDistributionOrFallback()
    const server = distribution.getServerById('tokemon')
    assert.equal(server.rawServer.version, staging.version)
    const processor = new DistributionIndexProcessor(path.join(data, 'common'), distribution, 'tokemon')
    const queue = []
    await processor.validateModules(server.modules.filter(changed), queue)
    for (const asset of queue) await downloadFile(asset.url, asset.path)
    for (const module of server.modules.filter(changed)) {
        const expected = staging.changes.find(item => module.rawModule.id.startsWith(`ktz.tokemon:${item.record.id}:`))
        assert.equal(hash(module.getPath()), expected.record.sha256)
    }
    // Only refresh the actual launch list when no game uses this instance. Never stop a user's game.
    const ps = '$ErrorActionPreference=\'Stop\';$p=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -match \'^javaw?\\.exe$\' -and $_.CommandLine -like \'*instances*tokemon*\'});@{running=$p.Count} | ConvertTo-Json -Compress'
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, 'Game process inspection failed')
    const active = JSON.parse(result.stdout).running > 0
    let launchListUpdated = false
    if (!active) {
        const launchList = path.join(data, 'instances/tokemon/forgeMods.list')
        if (fs.existsSync(launchList)) fs.copyFileSync(launchList, path.join(staging.backup, 'forgeMods.list'), fs.constants.COPYFILE_EXCL)
        const pb = builder(server, data)
        const mods = pb.resolveModConfiguration({}, server.modules).fMods
        assert.equal(mods.length, staging.modCount)
        // Keep missing pre-existing artifacts for the normal PLAY repair flow, rather than changing unrelated files here.
        assert.ok(server.modules.filter(changed).every(module => fs.existsSync(module.getPath())))
        pb.constructModList(mods)
        launchListUpdated = true
    }
    assertProtected()
    return { cachedIndexVersion: server.rawServer.version, changedArtifactsVerified: staging.changes.length, downloaded: queue.length, localLaunchListUpdated: launchListUpdated, existingGamePreserved: active, authenticatedGameLaunched: false }
}

async function main() {
    fs.mkdirSync(runRoot, { recursive: true })
    const candidate = read(path.join(root, 'distribution.json'))
    assert.deepEqual(candidate.servers.filter(server => server.id !== 'tokemon'), before.servers.filter(server => server.id !== 'tokemon'))
    const current = candidate.servers.find(server => server.id === 'tokemon')
    const old = before.servers.find(server => server.id === 'tokemon')
    const untouched = modules => modules.filter(module => !staging.changes.some(item => module.id.startsWith(`ktz.tokemon:${item.record.id}:`)))
    assert.deepEqual(untouched(current.modules), untouched(old.modules))
    assert.deepEqual({ ...current, modules: [], version: '' }, { ...old, modules: [], version: '' })
    assert.equal(current.version, staging.version)
    assert.equal(inventory.modCount, staging.modCount)
    assert.equal(inventory.mods.length, staging.modCount)
    const inventoryBefore = read(path.join(staging.backup, 'docs/packs/tokemon-files.json'))
    assert.deepEqual(inventory.mods.filter(mod => mod.id !== 'tokemon_shop'), inventoryBefore.mods.filter(mod => mod.id !== 'tokemon_shop'))
    assert.deepEqual(inventory.mods.find(mod => mod.id === 'tokemon_shop'), staging.changes[0].record)
    for (const item of staging.changes) assert.equal(hash(path.join(root, item.relative)), item.record.sha256)
    assertRuntimeUntouched()
    let transport
    let url = remoteUrl
    if (!published) {
        transport = http.createServer((request, response) => {
            if (request.url === '/distribution.json') {
                const staged = structuredClone(candidate)
                for (const module of staged.servers.find(server => server.id === 'tokemon').modules) {
                    if (staging.changes.some(item => module.id.startsWith(`ktz.tokemon:${item.record.id}:`))) module.artifact.url = `http://127.0.0.1:${transport.address().port}/` + module.artifact.url.slice(rawBase.length)
                }
                response.setHeader('Content-Type', 'application/json')
                response.end(JSON.stringify(staged))
            } else {
                const item = staging.changes.find(item => '/' + item.relative === request.url)
                if (!item) { response.writeHead(404); response.end(); return }
                response.end(fs.readFileSync(path.join(root, item.relative)))
            }
        })
        await new Promise(resolve => transport.listen(0, '127.0.0.1', resolve))
        url = `http://127.0.0.1:${transport.address().port}/distribution.json`
    }
    try {
        const oldPack = await seedOldPack(runRoot)
        const launcher = path.join(runRoot, 'launcher')
        fs.mkdirSync(launcher)
        write(path.join(launcher, 'distribution.json'), before)
        const api = new DistributionAPI(launcher, path.join(runRoot, 'common'), path.join(runRoot, 'instances'), url, false)
        const distribution = await api.refreshDistributionOrFallback()
        const server = distribution.getServerById('tokemon')
        assert.equal(server.rawServer.version, staging.version, 'Remote distribution has not advanced')
        assert.equal(server.hostname, oldPack.hostname)
        assert.equal(server.port, oldPack.port)
        const processor = new DistributionIndexProcessor(path.join(runRoot, 'common'), distribution, 'tokemon')
        const queued = (await processor.validate(async () => {})).distribution
        assert.equal(queued.length, staging.changes.length, 'Only the updated shop should need downloading')
        const expectedIds = server.modules.filter(changed).map(module => module.rawModule.id).sort()
        assert.deepEqual(queued.map(asset => asset.id).sort(), expectedIds)
        for (const asset of queued) await downloadFile(asset.url, asset.path)
        assert.equal((await processor.validate(async () => {})).distribution.length, 0)
        const pb = builder(server, runRoot)
        const mods = pb.resolveModConfiguration({}, server.modules).fMods
        assert.equal(mods.length, staging.modCount)
        const args = pb.constructModList(mods)
        assert.equal(args[0], '--fabric.addMods')
        const loaded = fs.readFileSync(pb.forgeModListFile, 'utf8').trim().split(/\r?\n/)
        assert.equal(loaded.length, staging.modCount)
        const loadedIds = new Set()
        for (const file of loaded) {
            const raw = new AdmZip(file).readAsText('fabric.mod.json')
            const meta = JSON.parse(raw.replace(/"(?:[^"\\]|\\.)*"/gs, value => value.replace(/[\u0000-\u001f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)))
            assert.ok(!loadedIds.has(meta.id), 'Duplicate runtime mod: ' + meta.id)
            loadedIds.add(meta.id)
            const expected = inventory.mods.find(mod => mod.id === meta.id)
            assert.ok(expected, meta.id)
            assert.equal(hash(file), expected.sha256)
        }
        const oldShop = oldPack.modules.find(module => module.rawModule.id.startsWith('ktz.tokemon:tokemon_shop:'))
        assert.ok(fs.existsSync(oldShop.getPath()), 'Old cache must be preserved')
        assert.ok(!loaded.includes(oldShop.getPath()), 'Old shop must be excluded from the new launch list')
        const shop = mods.find(module => module.rawModule.id.startsWith('ktz.tokemon:tokemon_shop:'))
        fs.writeFileSync(shop.getPath(), 'isolated corrupt-download check')
        const repair = (await processor.validate(async () => {})).distribution
        assert.equal(repair.length, 1)
        assert.equal(repair[0].id, shop.rawModule.id)
        await downloadFile(repair[0].url, repair[0].path)
        assert.equal((await processor.validate(async () => {})).distribution.length, 0)
        assert.equal(hash(shop.getPath()), staging.changes[0].record.sha256)
        assert.equal(hash(oldShop.getPath()), inventoryBefore.mods.find(mod => mod.id === 'tokemon_shop').sha256)
        const connect = []
        pb._processAutoConnectArg(connect)
        assert.deepEqual(connect, ['--quickPlayMultiplayer', `${oldPack.hostname}:${oldPack.port}`])
        if (published) assert.deepEqual(distribution.rawDistribution, candidate)
        assertProtected()
        assertRuntimeUntouched()
        const local = installLocal ? await localInstall() : null
        const report = { checkedAt: new Date().toISOString(), mode, version: staging.version, modCount: staging.modCount, unchangedModCount: staging.modCount - staging.changes.length, oldVersion: oldPack.rawServer.version, shopJarSha256: staging.changes[0].record.sha256, downloadedUpdatedArtifacts: queued.length, nativeDistributionRefreshVerified: true, nativeDownloadValidatorVerified: true, checksumRepairVerified: true, nativeProcessBuilderVerified: true, loadedModIds: [...loadedIds], oldShopExcluded: true, existingServersAndModulesPreserved: true, settingsJavaOptionsPreserved: true, actualRuntimeFilesUntouchedBeforeInstall: true, autoConnect: connect, local, authenticatedGameLaunched: false, guiHumanGameplayVerified: false }
        write(path.join(runRoot, 'verification.json'), report)
        write(path.join(work, mode + '-verification.json'), report)
        console.log(JSON.stringify({ mode, version: report.version, modCount: report.modCount, updatedArtifacts: queued.length, oldShopExcluded: true, settingsPreserved: true, local, report: path.join(runRoot, 'verification.json') }))
    } finally {
        if (transport) await new Promise(resolve => transport.close(resolve))
    }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
