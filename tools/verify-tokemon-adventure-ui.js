const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const vm = require('vm')
const http = require('http')
const { createRequire } = require('module')
const AdmZip = require('adm-zip')
const { DistributionAPI, HeliosDistribution } = require('helios-core/common')
const { DistributionIndexProcessor, downloadFile } = require('helios-core/dl')
const root = 'C:/codex/Projects/KTZ-Launcher'
const work = 'C:/codex/Builds/Tokemon-AdventureUI-20261018'
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const hash = (p, algorithm = 'sha256') => crypto.createHash(algorithm).update(fs.readFileSync(p)).digest('hex')
const stage = read(work + '/launcher-staging.json')
const candidate = read(work + '/launcher-candidate/distribution.json')
const before = read(stage.backup + '/distribution.json')
const inventory = read(work + '/launcher-candidate/docs/packs/tokemon-files.json')
const configPath = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher/config.json'
const config = read(configPath)
const actualRoot = config.settings.launcher.dataDirectory
const protectedPaths = [configPath, actualRoot + '/instances/tokemon/options.txt', actualRoot + '/instances/tokemon/forgeMods.list'].filter(p => fs.existsSync(p))
const protectedBefore = protectedPaths.map(file => ({ file, sha256: hash(file) }))
const current = candidate.servers.find(s => s.id === 'tokemon')
const old = before.servers.find(s => s.id === 'tokemon')
const published = process.argv.includes('--published')
const install = process.argv.includes('--install-local')
assert.ok(!install || published)
assert.deepEqual(current.modules.slice(0, -1), old.modules)
assert.deepEqual({ ...current, modules: [], version: '' }, { ...old, modules: [], version: '' })
assert.deepEqual(candidate.servers.filter(s => s.id !== 'tokemon'), before.servers.filter(s => s.id !== 'tokemon'))
assert.deepEqual(read(root + '/admin/servers.json'), read(stage.backup + '/admin/servers.json'))
assert.deepEqual(inventory.mods.slice(0, -1), read(stage.backup + '/docs/packs/tokemon-files.json').mods)
assert.equal(hash(root + '/' + stage.relative), stage.record.sha256)
const output = work + '/launcher-' + (published ? 'published-' : 'staged-') + Date.now()
fs.mkdirSync(output, { recursive: true })
const req = createRequire(root + '/package.json')
const changed = m => m.rawModule.id.startsWith('ktz.tokemon:tokemon_adventure_ui:')
const flatten = modules => modules.flatMap(m => [m, ...flatten(m.subModules)])
function builder(server) {
    const cfg = { getCommonDirectory: () => output + '/common', getInstanceDirectory: () => output + '/instances', getAutoConnect: () => true }
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(root + '/app/assets/js/processbuilder.js', 'utf8'), { module, exports: module.exports, process, console, Buffer, require: id => id === './configmanager' ? cfg : req(id) })
    const pb = new module.exports(server, {}, {}, {}, require(root + '/package.json').version)
    pb.usingFabricLoader = true
    fs.mkdirSync(pb.gameDir, { recursive: true })
    return pb
}
async function main() {
    const actual = new HeliosDistribution(before, actualRoot + '/common', actualRoot + '/instances').getServerById('tokemon')
    const seeded = new HeliosDistribution(before, output + '/common', output + '/instances').getServerById('tokemon')
    const actualModules = new Map(flatten(actual.modules).map(m => [m.rawModule.id, m]))
    for (const m of flatten(seeded.modules)) {
        const from = actualModules.get(m.rawModule.id).getPath()
        fs.mkdirSync(path.dirname(m.getPath()), { recursive: true })
        assert.equal(hash(from, 'md5'), m.rawModule.artifact.MD5, m.rawModule.id)
        fs.copyFileSync(from, m.getPath())
    }
    let transport
    let url = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/distribution.json?adventure-ui=' + stage.record.sha256.slice(0, 12)
    if (!published) {
        transport = http.createServer((request, response) => {
            if (request.url === '/distribution.json') {
                const index = structuredClone(candidate)
                index.servers.find(s => s.id === 'tokemon').modules.at(-1).artifact.url = 'http://127.0.0.1:' + transport.address().port + '/' + stage.relative
                response.end(JSON.stringify(index))
            } else if (request.url === '/' + stage.relative) response.end(fs.readFileSync(root + '/' + stage.relative))
            else { response.writeHead(404); response.end() }
        })
        await new Promise(resolve => transport.listen(0, '127.0.0.1', resolve))
        url = 'http://127.0.0.1:' + transport.address().port + '/distribution.json'
    }
    try {
        const launcher = output + '/launcher'
        fs.mkdirSync(launcher)
        fs.writeFileSync(launcher + '/distribution.json', JSON.stringify(before))
        const api = new DistributionAPI(launcher, output + '/common', output + '/instances', url, false)
        const distribution = await api.refreshDistributionOrFallback()
        const server = distribution.getServerById('tokemon')
        assert.equal(server.rawServer.version, stage.version)
        const processor = new DistributionIndexProcessor(output + '/common', distribution, 'tokemon')
        const queue = (await processor.validate(async () => {})).distribution
        assert.equal(queue.length, 1)
        assert.ok(changed(server.modules.find(m => m.rawModule.id === queue[0].id)))
        for (const asset of queue) await downloadFile(asset.url, asset.path)
        assert.equal((await processor.validate(async () => {})).distribution.length, 0)
        const ui = server.modules.find(changed)
        assert.equal(hash(ui.getPath()), stage.record.sha256)
        fs.appendFileSync(ui.getPath(), 'QA checksum repair')
        const repair = (await processor.validate(async () => {})).distribution
        assert.equal(repair.length, 1)
        await downloadFile(repair[0].url, repair[0].path)
        assert.equal(hash(ui.getPath()), stage.record.sha256)
        const pb = builder(server)
        const mods = pb.resolveModConfiguration({}, server.modules).fMods
        const args = pb.constructModList(mods)
        assert.equal(args[0], '--fabric.addMods')
        const files = fs.readFileSync(pb.forgeModListFile, 'utf8').trim().split(/\r?\n/)
        assert.equal(files.length, 58)
        const ids = new Set()
        for (const file of files) {
            const raw = new AdmZip(file).readAsText('fabric.mod.json')
            const meta = JSON.parse(raw.replace(/"(?:[^"\\]|\\.)*"/gs, value => value.replace(/[\u0000-\u001f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))))
            assert.ok(!ids.has(meta.id), 'Duplicate mod ' + meta.id)
            ids.add(meta.id)
            assert.equal(hash(file), inventory.mods.find(m => m.id === meta.id).sha256)
            if (meta.id === 'tokemon_adventure_ui') assert.equal(meta.environment, 'client')
        }
        let installed = false
        if (install) {
            const api = new DistributionAPI(path.dirname(configPath), actualRoot + '/common', actualRoot + '/instances', url, false)
            const live = await api.refreshDistributionOrFallback()
            assert.deepEqual(live.getServerById('tokemon').rawServer, current)
            const dl = new DistributionIndexProcessor(actualRoot + '/common', live, 'tokemon')
            const assets = []
            const added = live.getServerById('tokemon').modules.filter(changed)
            await dl.validateModules(added, assets)
            for (const asset of assets) await downloadFile(asset.url, asset.path)
            assert.equal(hash(added[0].getPath()), stage.record.sha256)
            installed = true
        }
        for (const item of protectedBefore) assert.equal(hash(item.file), item.sha256, 'Existing client file changed: ' + item.file)
        const result = { at: new Date().toISOString(), output, version: stage.version, modules: files.length, sha256: stage.record.sha256, nativeRefreshDownloadAndRepairPassed: true, nativeLaunchListPassed: true, old57ModsPreserved: true, settingsJavaOptionsAndActiveLaunchListPreserved: true, clientOnly: true, published, installed, authenticatedGameplayVerifiedByThisScript: false }
        fs.writeFileSync(work + '/launcher-' + (published ? 'published' : 'verified') + '.json', JSON.stringify(result, null, 2))
        console.log(JSON.stringify(result))
    } finally { if (transport) await new Promise(resolve => transport.close(resolve)) }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
