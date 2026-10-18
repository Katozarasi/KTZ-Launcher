const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')
const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-JourneyMapKeys-20261018'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const checked = read(read('C:/codex/Projects/Tokemon/adventure-ui/build-result.json').manifest)
const audit = read('C:/codex/Builds/Tokemon-JourneyMapKeysQA-20261018/client-ready/audit.json')
assert.equal(audit.passed, true)
assert.equal(audit.journeyMapKeys, 22)
assert.equal(audit.translationsMatched, 997)
const bytes = fs.readFileSync(checked.jar)
assert.equal(hash(bytes), checked.sha256)
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_adventure_ui')
assert.equal(meta.version, '0.1.1')
assert.equal(meta.environment, 'client')
assert.ok(!archive.getEntries().some(entry => entry.entryName.includes('adventureuiqa')))
const distributionFile = path.join(root, 'distribution.json')
const inventoryFile = path.join(root, 'docs/packs/tokemon-files.json')
const originalDistribution = fs.readFileSync(distributionFile)
const originalInventory = fs.readFileSync(inventoryFile)
const before = JSON.parse(originalDistribution)
const inventoryBefore = JSON.parse(originalInventory)
const candidate = structuredClone(before)
const server = candidate.servers.find(item => item.id === 'tokemon')
const old = before.servers.find(item => item.id === 'tokemon')
const index = server.modules.findIndex(mod => mod.id.startsWith('ktz.tokemon:' + meta.id + ':'))
const inventoryIndex = inventoryBefore.mods.findIndex(mod => mod.id === meta.id)
assert.ok(index >= 0 && inventoryIndex >= 0)
assert.equal(inventoryBefore.mods[inventoryIndex].version, '0.1.0')
assert.equal(old.modules.filter(mod => mod.type === 'FabricMod').length, inventoryBefore.modCount)
const oldBytes = fs.readFileSync(path.join(root, old.modules[index].artifact.url.split('/main/')[1]))
const oldArchive = new AdmZip(oldBytes)
let preservedAssets = 0
for (const entry of oldArchive.getEntries().filter(entry => entry.entryName.startsWith('assets/'))) {
    assert.deepEqual(archive.readFile(entry.entryName), entry.getData())
    preservedAssets++
}
const version = old.version.replace(/\d+$/, n => String(Number(n) + 1))
const relative = 'files/packs/tokemon/mods/tokemon-adventure-ui-0.1.1.jar'
assert.ok(!fs.existsSync(path.join(root, relative)))
const record = { ...inventoryBefore.mods[inventoryIndex], file: path.basename(relative), version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative }
server.modules[index] = { ...old.modules[index], id: 'ktz.tokemon:' + meta.id + ':' + record.sha256.slice(0, 12),
    name: '토켓몬 모험 수첩 한글화 0.1.1 · 지도 J 전용',
    artifact: { size: record.size, MD5: record.md5, url: record.url } }
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods[inventoryIndex] = record
for (let i = 0; i < old.modules.length; i++) if (i !== index) assert.deepEqual(server.modules[i], old.modules[i])
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(before.servers.filter(item => item.id !== 'tokemon'), candidate.servers.filter(item => item.id !== 'tokemon'))
const backup = work + '/backup'
assert.ok(!fs.existsSync(backup), 'Preserve previous staging backup')
fs.mkdirSync(backup, { recursive: true })
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const dest = path.join(backup, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(root, file), dest, fs.constants.COPYFILE_EXCL)
}
const user = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(user + '/config.json')
const instance = path.join(config.settings.launcher.dataDirectory, 'instances/tokemon')
fs.mkdirSync(backup + '/private')
const protect = (files, prefix) => files.filter(fs.existsSync).map((file, i) => {
    const dest = path.join(backup, 'private', prefix + i + '-' + path.basename(file))
    fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL)
    return { file, backup: dest, sha256: hash(fs.readFileSync(file)) }
})
const mapDir = path.join(instance, 'journeymap/config/6.0')
const mapSettings = fs.existsSync(mapDir) ? fs.readdirSync(mapDir).filter(name => name.endsWith('.config')).map(name => path.join(mapDir, name)) : []
const protectedFiles = protect([user + '/config.json', instance + '/options.txt', instance + '/config/tokemon-adventure-ui.json', ...mapSettings], 'settings-')
const untouchedRuntimeFiles = protect([user + '/distribution.json', instance + '/forgeMods.list'], 'runtime-')
assert.equal(hash(fs.readFileSync(distributionFile)), hash(originalDistribution), 'Concurrent distribution update')
assert.equal(hash(fs.readFileSync(inventoryFile)), hash(originalInventory), 'Concurrent inventory update')
fs.copyFileSync(checked.jar, path.join(root, relative), fs.constants.COPYFILE_EXCL)
write(distributionFile, candidate)
write(inventoryFile, inventory)
write(work + '/staging.json', { createdAt: new Date().toISOString(), version, oldVersion: old.version,
    modCount: inventory.modCount, root, backup, instance, protectedFiles, untouchedRuntimeFiles,
    changes: [{ relative, record, source: checked.jar, from: old.modules[index] }], unchangedModCount: inventoryBefore.modCount - 1,
    preservedAssetEntries: preservedAssets, clientOnly: true, productionServerUntouched: true, raidDeploymentHeld: true,
    otherServersPreserved: true, otherModsPreserved: true })
fs.writeFileSync(path.join(root, 'docs/packs/tokemon-' + version + '.txt'), `Tokemon pack ${version}\n\nJourneyMap: keep J for the fullscreen map; unassign the other 21 map shortcuts once for existing and new players. Reset defaults follow the same rule. Later player assignments are preserved.\n\nAdventure UI 0.1.1 preserves all 997 translations and the independent FTB key policy. No server update/restart. Close Minecraft, then KTZ Tokemon PLAY to load the update. Other mods, options, Java settings, map settings, waypoints and server address are preserved.\n\nIsolated offline native client verification is not production player reconnect proof. Raid reward deployment remains held.\n\nSHA256 ${record.sha256}\n`)
console.log(JSON.stringify({ version, oldVersion: old.version, modCount: inventory.modCount, sha256: record.sha256, preservedAssetEntries: preservedAssets, work }))
