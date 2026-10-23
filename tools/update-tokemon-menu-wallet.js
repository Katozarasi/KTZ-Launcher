const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-MenuWallet-20261023'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const baseSha256 = '010fa1b8bb415c7d5b2dc3b3349b715d5139e2397260975f4b85064ff5115e62'
const checked = read('C:/codex/Projects/Tokemon/reports/menu-wallet-20261023/candidate.json')
assert.equal(checked.version, '0.2.10')
assert.equal(checked.baseSha256, baseSha256)
assert.equal(checked.nativeQaPassed, true, 'Native wallet rendering and ledger checks must pass')
assert.equal(checked.nativeQaPassed, true, 'Native shop balance and rendered menu checks must pass')
assert.equal(checked.serverUpdateRequired, true)
assert.equal(checked.serverUpdateRequired, true, 'Stage the wallet bridge for the next normal server start')
assert.equal(checked.protocolUnchanged, true)
assert.equal(checked.walletResponseIsOptional, true)
assert.equal(checked.serverUpdateRequired, true)
assert.equal(checked.protocolUnchanged, true, 'This battle UI update must not change the network protocol')
const bytes = fs.readFileSync(checked.jar)
assert.equal(hash(bytes), checked.sha256, 'Candidate differs from the native-tested artifact')
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_battle')
assert.equal(meta.version, '0.2.10')
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
assert.equal(previous.version, '0.2.9', 'Review any newer battle release before replacing it')
assert.equal(previous.sha256, baseSha256, 'The base battle artifact has changed')
assert.equal(inventoryBefore.modCount, 74, 'Review a concurrently changed mod inventory')
assert.equal(inventoryBefore.mods.length, inventoryBefore.modCount)
assert.equal(old.modules.filter(module => module.type === 'FabricMod').length, inventoryBefore.modCount)
assert.match(old.version, /^2026\.10\.23\.\d+$/)
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
const allowedAdded = checked.added
const allowedChanges = checked.changed
assert.deepEqual(actualAdded, allowedAdded, 'Unexpected added class outside the reviewed menu wallet implementation')
assert.deepEqual(actualRemoved, [], 'No existing archive entry may be removed')
assert.deepEqual(actualChanges, allowedChanges, 'Unexpected change outside the reviewed wallet menu/server classes')
const oldMeta = JSON.parse(oldArchive.readAsText('fabric.mod.json'))
assert.equal(oldMeta.version, '0.2.9')
assert.deepEqual({ ...meta, version: '' }, { ...oldMeta, version: '' }, 'Entrypoints, dependencies and mixins must remain unchanged')

const version = old.version.replace(/\d+$/, n => String(Number(n) + 1))
const relative = 'files/mods/tokemon/tokemon-battle-0.2.10.jar'
assert.ok(!fs.existsSync(path.join(root, relative)), 'Preserve an existing release artifact')
const record = { file: path.basename(relative), id: meta.id, version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative, custom: true }
server.modules[server.modules.findIndex(changed)] = { ...server.modules.find(changed),
    id: 'ktz.tokemon:tokemon_battle:' + record.sha256.slice(0, 12), name: 'tokemon_battle 0.2.10',
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
    serverClassesUnchanged: false, protocolUnchanged: true, menuAndDataUnchanged: false, existingDataPreserved: true, additiveHomeData: false,
    otherServersPreserved: true, otherModsPreserved: true })
fs.writeFileSync(path.join(root, 'docs/packs/tokemon-' + version + '.txt'), `Tokemon pack ${version}

Battle 0.2.10 adds the player's current WON balance below Land Management in the Shift F menu, including its warp view. The amount comes from the existing server shop ledger and refreshes every five seconds while the menu is open. Wallet-only updates preserve the current view and home cooldown timer. Unavailable or locked ledgers display an unavailable message instead of zero.

Client relaunch through KTZ is required. The server update and a PvP dependency metadata-only compatibility adjustment are staged separately for the next normal server start. Existing running games and servers are preserved.

Battle 0.2.10 SHA256 ${record.sha256}
Native menu and shop-ledger QA passed in an isolated environment. Authenticated production player gameplay is not claimed.
`)
console.log(JSON.stringify({ version, oldVersion: old.version, modCount: inventory.modCount, unchangedModCount: inventory.modCount - 1, sha256: record.sha256, work }))
