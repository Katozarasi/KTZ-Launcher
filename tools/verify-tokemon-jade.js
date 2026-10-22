const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict'), vm = require('vm'), http = require('http')
const { createRequire } = require('module')
const AdmZip = require('adm-zip')
const { DistributionAPI, HeliosDistribution } = require('helios-core/common')
const { DistributionIndexProcessor, downloadFile } = require('helios-core/dl')
const root = path.resolve(__dirname, '..'), work = 'C:/codex/Builds/KTZ-Tokemon-Jade-20261023'
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''))
const hash = (f, a = 'sha256') => crypto.createHash(a).update(fs.readFileSync(f)).digest('hex')
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n')
const staging = read(work + '/staging.json'), before = read(staging.backup + '/distribution.json'), expected = read(root + '/distribution.json'), inventory = read(root + '/docs/packs/tokemon-files.json')
const published = process.argv.includes('--published'), mode = published ? 'published' : 'staged', run = work + '/' + mode + '-' + Date.now()
const snapshot = item => ({ ...item, existed: fs.existsSync(item.file), sha256: fs.existsSync(item.file) ? hash(item.file) : null })
const protectedFiles = [...staging.protectedFiles, ...staging.runtimeFiles].map(snapshot)
const parent = f => fs.mkdirSync(path.dirname(f), { recursive: true })
const flatten = modules => modules.flatMap(m => [m, ...flatten(m.subModules || [])])
const jade = m => m.rawModule.id.startsWith('ktz.tokemon:jade:')
const raw = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'
function builder(server) {
    const load = createRequire(root + '/package.json'), module = { exports: {} }
    const cfg = { getCommonDirectory: () => run + '/common', getInstanceDirectory: () => run + '/instances', getAutoConnect: () => true }
    vm.runInNewContext(fs.readFileSync(root + '/app/assets/js/processbuilder.js', 'utf8'), { module, exports: module.exports, process, console, Buffer, require: id => id === './configmanager' ? cfg : load(id) })
    const pb = new module.exports(server, {}, {}, {}, require(root + '/package.json').version)
    pb.usingFabricLoader = true
    fs.mkdirSync(pb.gameDir, { recursive: true })
    return pb
}
async function main() {
    fs.mkdirSync(run, { recursive: true })
    fs.mkdirSync(run + '/launcher', { recursive: true })
    const config = read('C:/Users/nabar/AppData/Roaming/KTZ Launcher/config.json'), data = config.settings.launcher.dataDirectory
    const old = new HeliosDistribution(before, run + '/common', run + '/instances').getServerById('tokemon')
    const actual = new HeliosDistribution(before, path.join(data, 'common'), path.join(data, 'instances')).getServerById('tokemon')
    const actualMods = new Map(flatten(actual.modules).map(m => [m.rawModule.id, m]))
    for (const m of flatten(old.modules)) {
        const artifact = m.rawModule.artifact, source = actualMods.get(m.rawModule.id).getPath()
        const options = [source, artifact.url.startsWith(raw) ? path.join(root, artifact.url.slice(raw.length)) : null, 'C:/codex/Cache/KTZ-Launcher/tokemon-artifacts/' + artifact.MD5].filter(Boolean)
        const found = options.find(f => fs.existsSync(f) && hash(f, 'md5') === artifact.MD5)
        parent(m.getPath())
        if (found) fs.copyFileSync(found, m.getPath(), fs.constants.COPYFILE_EXCL)
        else await downloadFile(artifact.url, m.getPath())
        assert.equal(hash(m.getPath(), 'md5'), artifact.MD5)
    }
    assert.deepEqual(expected.servers.find(s => s.id === 'tokemon').modules.filter(m => !m.id.startsWith('ktz.tokemon:jade:')), before.servers.find(s => s.id === 'tokemon').modules)
    assert.deepEqual(expected.servers.filter(s => s.id !== 'tokemon'), before.servers.filter(s => s.id !== 'tokemon'))
    let transport, url = raw + 'distribution.json'
    if (!published) {
        transport = http.createServer((req, res) => { if (req.url !== '/distribution.json') { res.writeHead(404); res.end(); return } res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(expected)) })
        await new Promise(resolve => transport.listen(0, '127.0.0.1', resolve))
        url = 'http://127.0.0.1:' + transport.address().port + '/distribution.json'
    }
    try {
        const api = new DistributionAPI(run + '/launcher', run + '/common', run + '/instances', url, false)
        const remote = await api.pullRemote()
        assert.ok(remote.data)
        assert.deepEqual(remote.data, expected, 'Public distribution must match reviewed release')
        await api.writeDistributionToDisk(remote.data)
        const distribution = await api.getDistributionLocalLoadOnly(), server = distribution.getServerById('tokemon')
        const processor = new DistributionIndexProcessor(run + '/common', distribution, 'tokemon')
        const queue = (await processor.validate(async () => {})).distribution
        assert.equal(queue.length, 1, 'Only Jade should need downloading')
        assert.equal(queue[0].id, server.modules.find(jade).rawModule.id)
        await downloadFile(queue[0].url, queue[0].path)
        assert.equal(hash(queue[0].path), staging.record.sha256)
        assert.equal((await processor.validate(async () => {})).distribution.length, 0)
        const pb = builder(server), mods = pb.resolveModConfiguration({}, server.modules).fMods
        assert.equal(mods.length, staging.modCount)
        assert.equal(pb.constructModList(mods)[0], '--fabric.addMods')
        const paths = fs.readFileSync(pb.forgeModListFile, 'utf8').trim().split(/\r?\n/), ids = new Set()
        assert.equal(paths.length, staging.modCount)
        assert.equal(new Set(paths).size, paths.length)
        for (const f of paths) {
            const text = new AdmZip(f).readAsText('fabric.mod.json')
            const meta = JSON.parse(text.replace(/"(?:[^"\\]|\\.)*"/gs, v => v.replace(/[\u0000-\u001f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))))
            assert.ok(!ids.has(meta.id), 'Duplicate Fabric ID')
            ids.add(meta.id)
            assert.equal(hash(f), inventory.mods.find(m => m.id === meta.id).sha256)
        }
        assert.ok(ids.has('jade'))
        fs.writeFileSync(queue[0].path, 'isolated corruption probe')
        const repair = (await processor.validate(async () => {})).distribution
        assert.equal(repair.length, 1)
        assert.equal(repair[0].id, queue[0].id)
        await downloadFile(repair[0].url, repair[0].path)
        assert.equal(hash(repair[0].path), staging.record.sha256)
        const connect = []
        pb._processAutoConnectArg(connect)
        assert.deepEqual(connect, ['--quickPlayMultiplayer', `${old.hostname}:${old.port}`])
        for (const f of protectedFiles) { assert.equal(fs.existsSync(f.file), f.existed); if (f.existed) assert.equal(hash(f.file), f.sha256, 'Protected user file changed: ' + f.file) }
        assert.deepEqual(read(root + '/admin/servers.json'), read(staging.backup + '/admin/servers.json'))
        const result = { status: 'PASS', mode, version: staging.version, modCount: paths.length, unchangedModCount: staging.unchangedModCount, nativeHeliosVerified: true, onlyJadeDownloaded: true, checksumRepairVerified: true, uniqueIds: [...ids], settingsAndRuntimeFilesPreserved: true, autoConnect: connect, productionTouched: false, authenticatedGameplayVerified: false, run }
        write(work + '/' + mode + '-verification.json', result)
        console.log(JSON.stringify({ status: 'PASS', mode, version: staging.version, modCount: paths.length }))
    } finally { if (transport) await new Promise(resolve => transport.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
