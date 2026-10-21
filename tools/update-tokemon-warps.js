const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-Warps-20261021'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const baseSha256 = 'eab31b3487ea8814270b14f809ddfb10ca6dda3bd7507f533a709b7df4b53d6a'
const checked = read('C:/codex/Projects/Tokemon/reports/menu-warps-20261021/candidate.json')
assert.equal(checked.version, '0.2.6')
assert.equal(checked.baseSha256, baseSha256)
assert.equal(checked.nativeQaPassed, true, 'Warp menu rendering must pass native QA')
assert.equal(checked.serverNativeQaPassed, true, 'Warp/home actions and restart persistence must pass native server-to-client QA')
assert.equal(checked.serverClassesUnchanged, false, 'The reviewed release includes server warp and home handling')
assert.equal(checked.serverUpdateRequired, true, 'Server warp actions require the staged server update')
assert.equal(checked.menuAndDataUnchanged, false)
assert.equal(checked.existingDataPreserved, true)
assert.equal(checked.additiveHomeData, true)
assert.equal(checked.protocolUnchanged, true, 'This battle UI update must not change the network protocol')
const bytes = fs.readFileSync(checked.jar)
assert.equal(hash(bytes), checked.sha256, 'Candidate differs from the native-tested artifact')
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_battle')
assert.equal(meta.version, '0.2.6')
assert.equal(meta.environment, '*')
assert.ok(!archive.getEntries().some(entry => /(^|\/)qa\//.test(entry.entryName)), 'Do not publish QA classes')

const distributionFile = path.join(root, 'distribution.json')
const inventoryFile = path.join(root, 'docs/packs/tokemon-files.json')
const originalDistribution = fs.readFileSync(distributionFile)
const originalInventory = fs.readFileSync(inventoryFile)
const before = JSON.parse(originalDistribution)
const inventoryBefore = JSON.parse(originalInventory)
const candidate = structuredClone(before)
const server = candidate.servers.find(item => item.id === 'tokemon')
const old = before.servers.find(item => item.id === 'tokemon')
const previous = inventoryBefore.mods.find(mod => mod.id === meta.id)
assert.equal(previous.version, '0.2.5', 'Review any newer battle release before replacing it')
assert.equal(previous.sha256, baseSha256, 'The base battle artifact has changed')
assert.equal(inventoryBefore.modCount, 71, 'Review a concurrently changed mod inventory')
assert.equal(inventoryBefore.mods.length, inventoryBefore.modCount)
assert.equal(old.modules.filter(module => module.type === 'FabricMod').length, inventoryBefore.modCount)
assert.match(old.version, /^2026\.10\.21\.\d+$/)
const changed = module => module.id.startsWith('ktz.tokemon:tokemon_battle:')
assert.equal(old.modules.filter(changed).length, 1)
assert.equal(old.modules.find(changed).id, 'ktz.tokemon:tokemon_battle:' + baseSha256.slice(0, 12))
assert.equal(old.modules.find(changed).artifact.MD5, previous.md5)
assert.equal(old.modules.find(changed).artifact.url, previous.url)

// Verify the complete archive diff directly, not just the candidate's compatibility declarations.
const oldJar = path.join(root, 'files/mods/tokemon', previous.file)
const oldBytes = fs.readFileSync(oldJar)
assert.equal(hash(oldBytes), baseSha256)
const oldArchive = new AdmZip(oldBytes)
const entries = zip => zip.getEntries().filter(entry => !entry.isDirectory).map(entry => entry.entryName).sort()
const oldEntries = entries(oldArchive), newEntries = entries(archive)
const actualAdded = newEntries.filter(name => !oldEntries.includes(name))
const actualRemoved = oldEntries.filter(name => !newEntries.includes(name))
const actualChanges = newEntries.filter(name => oldEntries.includes(name) && !archive.readFile(name).equals(oldArchive.readFile(name)))
const allowedAdded = [
    'dev/tokemon/battle/core/WarpHomeStore$Home.class',
    'dev/tokemon/battle/core/WarpHomeStore$Point.class',
    'dev/tokemon/battle/core/WarpHomeStore$State.class',
    'dev/tokemon/battle/core/WarpHomeStore.class',
    'dev/tokemon/battle/server/WarpService.class'
]
const allowedChanges = [
    'dev/tokemon/battle/client/screen/BattleScreen.class',
    'dev/tokemon/battle/client/screen/UiTheme$FlatButton.class',
    'dev/tokemon/battle/client/screen/UiTheme.class',
    'dev/tokemon/battle/server/BattleServer.class',
    'fabric.mod.json'
]
assert.deepEqual(actualAdded, allowedAdded, 'Unexpected added class outside the reviewed warp/home implementation')
assert.deepEqual(actualRemoved, [], 'No existing archive entry may be removed')
assert.deepEqual(actualChanges, allowedChanges, 'Unexpected change outside the reviewed menu/server classes')
const oldMeta = JSON.parse(oldArchive.readAsText('fabric.mod.json'))
assert.equal(oldMeta.version, '0.2.5')
assert.deepEqual({ ...meta, version: '' }, { ...oldMeta, version: '' }, 'Entrypoints, dependencies and mixins must remain unchanged')

const version = old.version.replace(/\d+$/, n => String(Number(n) + 1))
const relative = 'files/mods/tokemon/tokemon-battle-0.2.6.jar'
assert.ok(!fs.existsSync(path.join(root, relative)), 'Preserve an existing release artifact')
const record = { file: path.basename(relative), id: meta.id, version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative, custom: true }
server.modules[server.modules.findIndex(changed)] = { ...server.modules.find(changed),
    id: 'ktz.tokemon:tokemon_battle:' + record.sha256.slice(0, 12), name: 'tokemon_battle 0.2.6',
    artifact: { ...server.modules.find(changed).artifact, size: record.size, MD5: record.md5, url: record.url } }
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods = inventory.mods.map(mod => mod.id === meta.id ? record : mod)
assert.deepEqual(old.modules.filter(module => !changed(module)), server.modules.filter(module => !changed(module)))
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual({ ...before, servers: [] }, { ...candidate, servers: [] })
assert.deepEqual(before.servers.filter(item => item.id !== 'tokemon'), candidate.servers.filter(item => item.id !== 'tokemon'))
assert.deepEqual(inventoryBefore.mods.filter(mod => mod.id !== meta.id), inventory.mods.filter(mod => mod.id !== meta.id))
assert.deepEqual({ ...inventoryBefore, mods: [] }, { ...inventory, mods: [] })

const backup = path.join(work, 'backup')
assert.ok(!fs.existsSync(backup), 'Preserve previous staging backup; inspect it before retrying')
fs.mkdirSync(backup, { recursive: true })
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json', 'files/mods/tokemon/' + previous.file]) {
    const destination = path.join(backup, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL)
}
const user = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(user + '/config.json')
const instance = path.join(config.settings.launcher.dataDirectory, 'instances/tokemon')
fs.mkdirSync(path.join(backup, 'private'))
const protect = (files, prefix) => [...new Set(files)].map((file, index) => {
    if (!fs.existsSync(file)) return { file, existed: false }
    const destination = path.join(backup, 'private', prefix + index + '-' + path.basename(file))
    fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL)
    return { file, backup: destination, existed: true, sha256: hash(fs.readFileSync(file)) }
})
const mapDir = path.join(instance, 'journeymap/config/6.0')
const mapSettings = fs.existsSync(mapDir) ? fs.readdirSync(mapDir).filter(name => name.endsWith('.config')).map(name => path.join(mapDir, name)) : []
const protectedFiles = protect([user + '/config.json', instance + '/options.txt', instance + '/config/tokemon-battle-keys.json', ...mapSettings], 'settings-')
const untouchedRuntimeFiles = protect([user + '/distribution.json', instance + '/forgeMods.list'], 'runtime-')
assert.equal(hash(fs.readFileSync(distributionFile)), hash(originalDistribution), 'Concurrent distribution update: rebase')
assert.equal(hash(fs.readFileSync(inventoryFile)), hash(originalInventory), 'Concurrent inventory update: rebase')
fs.copyFileSync(checked.jar, path.join(root, relative), fs.constants.COPYFILE_EXCL)
write(distributionFile, candidate)
write(inventoryFile, inventory)
write(work + '/staging.json', { createdAt: new Date().toISOString(), version, oldVersion: old.version,
    modCount: inventory.modCount, root, backup, instance, protectedFiles, untouchedRuntimeFiles,
    changes: [{ relative, record, source: checked.jar, from: previous.version, baseSha256 }], unchangedModCount: inventory.modCount - 1,
    archiveChanges: actualChanges, archiveAdded: actualAdded, archiveRemoved: actualRemoved,
    clientOnlyChange: false, productionServerModifiedByLauncher: false, serverUpdateRequired: true,
    serverClassesUnchanged: false, protocolUnchanged: true, menuAndDataUnchanged: false, existingDataPreserved: true, additiveHomeData: true,
    otherServersPreserved: true, otherModsPreserved: true })
fs.writeFileSync(path.join(root, 'docs/packs/tokemon-' + version + '.txt'), `Tokemon pack ${version}

Battle 0.2.6 adds Warp below History / Spectate in Shift+F, and puts Quests immediately beside Battle Factory. Warp uses the existing menu font, rounded cards and click feedback. Public destinations: overworld spawn 3 74 100; village 825 63 7, at each block center. One private home per account. Deleting a home starts a one-hour registration lock; traveling home has no cooldown. The server stores homes and deletion deadlines durably across normal restarts, validates destinations and blocks warps while battling.

Close Minecraft and PLAY Tokemon in KTZ to load the client update. Warp/home actions require the operator's next normal server restart through Start-Tokemon.cmd, which applies the staged battle update and metadata-only PvP compatibility update. Existing battles, public forms/Tera types, hazards, rank displays, other menu actions, settings and all other modules remain preserved.

Battle 0.2.6 SHA256 ${record.sha256}

Verified by 70 home-store assertions, 362 isolated native two-client checks including a real server restart, rendered menu review at normal and small resolution, and next-start rollback checks. Authenticated production player gameplay is not claimed.
`)
console.log(JSON.stringify({ version, oldVersion: old.version, modCount: inventory.modCount, unchangedModCount: inventory.modCount - 1, sha256: record.sha256, work }))
