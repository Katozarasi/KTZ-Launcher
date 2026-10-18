const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-PrizeBox-20261018'
const source = 'C:/codex/Builds/Tokemon-PrizeBox64-20261018/build/libs/tokemon-prizes-0.1.1.jar'
const rawBase = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'
const version = '2026.10.18.3'
const id = 'tokemon_prizes'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const digest = (data, algorithm = 'sha256') => crypto.createHash(algorithm).update(data).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const before = read(path.join(root, 'distribution.json'))
const inventoryBefore = read(path.join(root, 'docs/packs/tokemon-files.json'))
const distro = structuredClone(before)
const server = distro.servers.find(server => server.id === 'tokemon')
assert.equal(server.version, '2026.10.18.2', 'Distribution advanced; inspect before publishing')
assert.ok(!server.modules.some(module => module.id.startsWith(`ktz.tokemon:${id}:`)))
const backup = path.join(work, 'backup')
fs.mkdirSync(backup, { recursive: true })
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const target = path.join(backup, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL)
}
const userRoot = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(userRoot + '/config.json')
const instance = path.join(config.settings.launcher.dataDirectory, 'instances', 'tokemon')
const protectedPaths = [userRoot + '/config.json', path.join(instance, 'options.txt'), path.join(instance, 'optionsshaders.txt'), path.join(instance, 'servers.dat')]
const privateBackup = path.join(backup, 'private')
fs.mkdirSync(privateBackup)
const protectedFiles = protectedPaths.filter(file => fs.existsSync(file)).map((file, index) => {
    const copy = path.join(privateBackup, `${index}-${path.basename(file)}`)
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL)
    return { file, backup: copy, sha256: digest(fs.readFileSync(file)) }
})
if (fs.existsSync(userRoot + '/distribution.json')) fs.copyFileSync(userRoot + '/distribution.json', path.join(backup, 'cached-distribution.json'), fs.constants.COPYFILE_EXCL)

const bytes = fs.readFileSync(source)
const zip = new AdmZip(bytes)
const meta = JSON.parse(zip.readAsText('fabric.mod.json'))
assert.equal(meta.id, id)
assert.equal(meta.version, '0.1.1')
assert.equal(meta.environment, '*')
const model = JSON.parse(zip.readAsText('assets/tokemon_prizes/models/item/mega_stone_box.json'))
assert.equal(model.parent, 'minecraft:item/generated')
assert.equal(model.elements, undefined)
const texture = zip.readFile('assets/tokemon_prizes/textures/item/mega_stone_box.png')
assert.equal(texture.readUInt32BE(16), 64)
assert.equal(texture.readUInt32BE(20), 64)
assert.ok(!zip.getEntries().some(entry => /Prize(Qa|VisualQa)/.test(entry.entryName)))
const previous = new AdmZip('C:/codex/Projects/Tokemon/prize-box/release/0.1.0/tokemon-prizes-0.1.0.jar')
const preserved = previous.getEntries().filter(entry => entry.entryName.endsWith('.class') || entry.entryName.startsWith('data/'))
for (const entry of preserved) assert.deepEqual(zip.readFile(entry.entryName), previous.readFile(entry.entryName), 'Gameplay changed: ' + entry.entryName)

const file = path.basename(source)
const relative = 'files/mods/tokemon/' + file
assert.ok(!fs.existsSync(path.join(root, relative)), 'Preserve existing artifact')
const record = { file, id, version: meta.version, size: bytes.length, md5: digest(bytes, 'md5'), sha256: digest(bytes), sha512: digest(bytes, 'sha512'), url: rawBase + relative, custom: true }
server.modules.push({ id: `ktz.tokemon:${id}:${record.sha256.slice(0, 12)}`, name: `${id} ${meta.version}`, type: 'FabricMod', required: { value: true }, artifact: { size: record.size, MD5: record.md5, url: record.url } })
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods.push(record)
inventory.modCount = inventory.mods.length
assert.equal(inventory.modCount, 42)
const oldServer = before.servers.find(server => server.id === 'tokemon')
assert.deepEqual(before.servers.filter(server => server.id !== 'tokemon'), distro.servers.filter(server => server.id !== 'tokemon'))
assert.deepEqual({ ...oldServer, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(oldServer.modules, server.modules.slice(0, -1))
assert.deepEqual(inventoryBefore.mods, inventory.mods.slice(0, -1))
fs.copyFileSync(source, path.join(root, relative), fs.constants.COPYFILE_EXCL)
write(path.join(root, 'distribution.json'), distro)
write(path.join(root, 'docs/packs/tokemon-files.json'), inventory)
write(path.join(work, 'staging.json'), { createdAt: new Date().toISOString(), version, oldVersion: oldServer.version, modCount: inventory.modCount, root, backup, protectedFiles, instance, changes: [{ relative, record, from: null }], otherServersPreserved: true, otherModsPreserved: true, settingsAndJavaUnchanged: true, pixelSize: [64, 64], model: 'minecraft:item/generated', unchangedGameplayEntries: preserved.length, serverActivationRequired: true })
console.log(JSON.stringify({ version, modCount: inventory.modCount, addedMods: 1, pixelSize: [64, 64], work }))
