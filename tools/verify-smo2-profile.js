// Exercise the real Helios distribution parser and integrity verifier in an isolated C:/codex layout.
const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { HeliosDistribution } = require('helios-core/common')
const { DistributionIndexProcessor } = require('helios-core/dl')

const root = path.resolve(__dirname, '..')
const out = process.argv[2] || 'C:/codex/Builds/SMO2-Launcher-20261030/profile'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const hash = bytes => crypto.createHash('md5').update(bytes).digest('hex')
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes) }
const id = 'smo2_theseed'

async function main() {
    assert(path.resolve(out).toLowerCase().startsWith('c:\\codex\\'))
    const data = read(path.join(root, 'distribution.json'))
    const before = read(path.join(out, 'backup/distribution.json'))
    assert.deepEqual(data.servers.filter(server => server.id !== id), before.servers.filter(server => server.id !== id))
    const common = path.join(out, 'qa/common')
    const instances = path.join(out, 'qa/instances')
    const distro = new HeliosDistribution(structuredClone(data), common, instances)
    const server = distro.getServerById(id)
    assert.equal(server.rawServer.name, 'KAO - THE SEED')
    assert.equal(server.port, 25566)
    assert.equal(server.rawServer.ktz.maintenance, true)
    assert.equal(server.rawServer.ktz.packManifest, undefined)
    assert.equal(server.effectiveJavaOptions.supported, '21.x')
    assert.equal(server.rawServer.javaOptions.ram.recommended, 8192)
    const inventory = read(path.join(out, 'inventory-local.json'))
    const records = new Map(inventory.map(record => [record.url + '\n' + record.path, record]))
    const all = []
    const visit = modules => { for (const module of modules) { all.push(module); visit(module.subModules) } }
    visit(server.modules)
    const targets = new Set()
    for (const module of all) {
        const target = module.getPath()
        assert(!targets.has(target.toLowerCase()), 'Duplicate installation path: ' + target)
        targets.add(target.toLowerCase())
        let source
        if (module.rawModule.type === 'VersionManifest') {
            source = path.join(root, 'files/loaders/forge/versions/1.20.1-forge-47.4.10/1.20.1-forge-47.4.10.json')
        } else {
            source = records.get(module.rawModule.artifact.url + '\n' + module.rawModule.artifact.path)?.source
        }
        assert(source && fs.existsSync(source), 'Missing source: ' + module.rawModule.id)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(source, target)
        assert.equal(hash(fs.readFileSync(target)), module.rawModule.artifact.MD5)
    }
    const options = path.join(instances, id, 'options.txt')
    const customOptions = Buffer.from('lang:en_us\nfov:0.6\nkey_key.inventory:key.keyboard.i\n')
    write(options, customOptions)
    const processor = new DistributionIndexProcessor(common, distro, id)
    const clean = await processor.validate(async () => {})
    assert.equal(clean.distribution.length, 0, 'Fresh profile failed actual downloader hash validation')
    const manifest = await processor.loadModLoaderVersionJson()
    assert.equal(manifest.id, '1.20.1-forge-47.4.10')
    assert.equal(manifest.mainClass, 'cpw.mods.bootstraplauncher.BootstrapLauncher')
    assert.deepEqual(fs.readFileSync(options), customOptions, 'User options were changed by pack verification')
    assert(!all.some(module => module.rawModule.artifact.path === 'options.txt'))
    assert(!all.some(module => module.rawModule.artifact.path?.includes('worldedit/schematics')))
    assert(all.some(module => module.rawModule.artifact.path === 'config/defaultoptions/keybindings.txt'))
    assert(all.some(module => module.rawModule.artifact.path?.includes('defaultoptions-forge-1.20.1-18.0.5.jar')))
    for (const name of ['forge-1.20.1-47.4.10-client.jar', 'client-1.20.1-20230612.114412-extra.jar', 'client-1.20.1-20230612.114412-srg.jar', 'fmlcore-1.20.1-47.4.10.jar']) {
        assert(all.some(module => module.rawModule.artifact.path?.endsWith(name)), 'Missing installer-only runtime library: ' + name)
    }
    // Confirm that a damaged file is identified precisely by the real downloader.
    const probe = server.modules.find(module => module.rawModule.artifact.path === 'config/defaultoptions/options.txt')
    const original = fs.readFileSync(probe.getPath())
    try {
        fs.appendFileSync(probe.getPath(), '\nverification-corruption')
        const damaged = await processor.validate(async () => {})
        assert.equal(damaged.distribution.length, 1)
        assert.equal(damaged.distribution[0].path, probe.getPath())
    } finally { fs.writeFileSync(probe.getPath(), original) }
    const restored = await processor.validate(async () => {})
    assert.equal(restored.distribution.length, 0)
    const summary = { status: 'PASSED_STATIC_AND_HELIOS_INTEGRITY', name: server.rawServer.name, modules: all.length,
        clientFiles: server.modules.length - 1, java: server.effectiveJavaOptions, originalServersPreserved: true,
        userOptionsPreserved: true, corruptedFileDetectedAndRestored: true, officialForgeManifestLoaded: true,
        common, instances, nativeClientLaunch: 'NOT_TESTED_BY_THIS_SCRIPT' }
    write(path.join(out, 'verification.json'), JSON.stringify(summary, null, 2) + '\n')
    console.log(JSON.stringify(summary, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
