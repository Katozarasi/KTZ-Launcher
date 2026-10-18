const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')
const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-Dialogue-20261018'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const checked = read('C:/codex/Projects/Tokemon/reports/dialogue-20261018/candidate.json')
assert.equal(checked.version, '0.1.0')
assert.equal(checked.nativeQaPassed, true, 'Native render verification is required before publication')
const bytes = fs.readFileSync(checked.jar)
assert.equal(hash(bytes), checked.sha256)
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_dialogue')
assert.equal(meta.version, '0.1.0')
assert.equal(meta.environment, '*')
assert.ok(!archive.getEntries().some(entry => entry.entryName.startsWith('dev/tokemon/dialogueqa/')))
const distributionFile = path.join(root, 'distribution.json')
const inventoryFile = path.join(root, 'docs/packs/tokemon-files.json')
const originalDistribution = fs.readFileSync(distributionFile)
const originalInventory = fs.readFileSync(inventoryFile)
const before = JSON.parse(originalDistribution)
const inventoryBefore = JSON.parse(originalInventory)
const candidate = structuredClone(before)
const server = candidate.servers.find(item => item.id === 'tokemon')
const old = before.servers.find(item => item.id === 'tokemon')
assert.ok(!inventoryBefore.mods.some(mod => mod.id === meta.id), 'Review an existing minimap release before replacing it')
assert.ok(!old.modules.some(mod => mod.id.startsWith('ktz.tokemon:' + meta.id + ':')))
assert.equal(inventoryBefore.modCount, inventoryBefore.mods.length)
assert.equal(old.modules.filter(mod => mod.type === 'FabricMod').length, inventoryBefore.modCount)
assert.match(old.version, /^2026\.10\.18\.\d+$/)
const version = old.version.replace(/\d+$/, n => String(Number(n) + 1))
const relative = 'files/mods/tokemon/tokemon-dialogue-0.1.0.jar'
assert.ok(!fs.existsSync(path.join(root, relative)), 'Preserve existing release artifact')
const record = { file: path.basename(relative), id: meta.id, version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative, custom: true }
server.modules.push({ id: 'ktz.tokemon:' + meta.id + ':' + record.sha256.slice(0, 12),
    name: '토켓몬 NPC 대화 0.1.0', type: 'FabricMod', required: { value: true },
    artifact: { size: record.size, MD5: record.md5, url: record.url } })
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods.push(record)
inventory.modCount = inventory.mods.length
assert.deepEqual(old.modules, server.modules.slice(0, -1))
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(before.servers.filter(item => item.id !== 'tokemon'), candidate.servers.filter(item => item.id !== 'tokemon'))
assert.deepEqual(inventoryBefore.mods, inventory.mods.slice(0, -1))
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
const protect = (files, prefix) => files.filter(fs.existsSync).map((file, index) => {
    const dest = path.join(backup, 'private', prefix + index + '-' + path.basename(file))
    fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL)
    return { file, backup: dest, sha256: hash(fs.readFileSync(file)) }
})
const mapDir = path.join(instance, 'journeymap/config/6.0')
const mapSettings = fs.existsSync(mapDir) ? fs.readdirSync(mapDir).filter(name => name.endsWith('.config')).map(name => path.join(mapDir, name)) : []
const protectedFiles = protect([user + '/config.json', instance + '/options.txt', ...mapSettings], 'settings-')
const untouchedRuntimeFiles = protect([user + '/distribution.json', instance + '/forgeMods.list'], 'runtime-')
assert.equal(hash(fs.readFileSync(distributionFile)), hash(originalDistribution), 'Concurrent distribution update: rebase')
assert.equal(hash(fs.readFileSync(inventoryFile)), hash(originalInventory), 'Concurrent inventory update: rebase')
fs.copyFileSync(checked.jar, path.join(root, relative), fs.constants.COPYFILE_EXCL)
write(distributionFile, candidate)
write(inventoryFile, inventory)
write(work + '/staging.json', { createdAt: new Date().toISOString(), version, oldVersion: old.version,
    modCount: inventory.modCount, root, backup, instance, protectedFiles, untouchedRuntimeFiles,
    changes: [{ relative, record, source: checked.jar, from: null }], unchangedModCount: inventoryBefore.modCount,
    clientOnly: false, requiresServerAddon: true, productionServerUntouched: true, otherServersPreserved: true, otherModsPreserved: true })
fs.writeFileSync(path.join(root, 'docs/packs/tokemon-' + version + '.txt'), `Tokemon pack ${version}\n\nAdd illustrated NPC dialogue in the Tokemon shop theme. Nurse Joy is the initial conversation; server-side JSON and PNG can add other NPCs without a client rebuild. Typed text, pages, choices, help and a direct scoped-shop connection are included.\n\nThis addon is required on the server to activate conversations. Server installation is staged separately pending restart approval; raid progression remains held. Older servers keep the existing NPC interaction. Close the running game and PLAY Tokemon in KTZ to load it. Existing mods, settings, server address and launcher executable are preserved.\n\nNPC Dialogue 0.1.0 SHA256 ${record.sha256}\n\nIsolated native game verification and launcher download/list checks do not claim an authenticated production player session.\n`)
console.log(JSON.stringify({ version, oldVersion: old.version, modCount: inventory.modCount, sha256: record.sha256, work }))
