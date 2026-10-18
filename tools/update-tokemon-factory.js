const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-Factory-20261018'
const tokemon = 'C:/codex/Projects/Tokemon'
const rawBase = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'
const version = '2026.10.18.1'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const digest = (data, algorithm = 'sha256') => crypto.createHash(algorithm).update(data).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const ids = new Set(['tokemon_factory_gui', 'tokemon_shop'])
const isChanged = module => [...ids].some(id => module.id.startsWith(`ktz.tokemon:${id}:`))

const before = read(path.join(root, 'distribution.json'))
const inventoryBefore = read(path.join(root, 'docs/packs/tokemon-files.json'))
const distro = structuredClone(before)
const server = distro.servers.find(server => server.id === 'tokemon')
assert.ok(server, 'Existing Tokemon entry required')
assert.equal(server.version, '2026.10.17.3', 'Distribution advanced; rebase before publishing')
const release = read(tokemon + '/reports/factory-growth-installation-20261018.json')
assert.equal(release.status, 'APPLIED_AND_RUNNING_VERIFIED')
const backup = path.join(work, 'backup')
fs.mkdirSync(backup, { recursive: true })
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const target = path.join(backup, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL)
}

// Preserve user settings separately from public distribution evidence. Never print account data.
const userRoot = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(userRoot + '/config.json')
const instance = path.join(config.settings.launcher.dataDirectory, 'instances', 'tokemon')
const protectedPaths = [userRoot + '/config.json', path.join(instance, 'options.txt')]
const privateBackup = path.join(backup, 'private')
fs.mkdirSync(privateBackup)
const protectedFiles = protectedPaths.filter(file => fs.existsSync(file)).map((file, index) => {
    const copy = path.join(privateBackup, `${index}-${path.basename(file)}`)
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL)
    return { file, backup: copy, sha256: digest(fs.readFileSync(file)) }
})
const cache = userRoot + '/distribution.json'
if (fs.existsSync(cache)) fs.copyFileSync(cache, path.join(backup, 'cached-distribution.json'), fs.constants.COPYFILE_EXCL)

const replacements = []
for (const [name, id, expectedVersion] of [['factory-gui', 'tokemon_factory_gui', '0.1.0'], ['shop', 'tokemon_shop', '0.2.2']]) {
    const approved = release.modules.find(module => module.name === name)
    assert.ok(approved, name)
    const source = tokemon + '/dist/Tokemon-BattleFactory-0.2.0/client/mods/' + approved.jar
    const bytes = fs.readFileSync(source)
    assert.equal(digest(bytes), approved.sha256)
    assert.equal(digest(fs.readFileSync(tokemon + '/server/mods/' + approved.jar)), approved.sha256)
    const meta = JSON.parse(new AdmZip(bytes).readAsText('fabric.mod.json'))
    assert.equal(meta.id, id)
    assert.equal(meta.version, expectedVersion)
    assert.equal(meta.environment, '*')
    const file = path.basename(source)
    const relative = 'files/mods/tokemon/' + file
    assert.ok(!fs.existsSync(path.join(root, relative)), 'Preserve an existing artifact: ' + relative)
    const record = { file, id, version: meta.version, size: bytes.length, md5: digest(bytes, 'md5'), sha256: digest(bytes), sha512: digest(bytes, 'sha512'), url: rawBase + relative, custom: true }
    const module = { id: `ktz.tokemon:${id}:${record.sha256.slice(0, 12)}`, name: `${id} ${meta.version}`, type: 'FabricMod', required: { value: true }, artifact: { size: record.size, MD5: record.md5, url: record.url } }
    const current = server.modules.findIndex(module => module.id.startsWith(`ktz.tokemon:${id}:`))
    if (current >= 0) server.modules[current] = module
    else server.modules.push(module)
    const old = inventoryBefore.mods.find(mod => mod.id === id)
    replacements.push({ source, relative, record, from: old?.version || null, module })
}
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods = inventoryBefore.mods.map(mod => replacements.find(item => item.record.id === mod.id)?.record || mod)
for (const item of replacements) if (!inventoryBefore.mods.some(mod => mod.id === item.record.id)) inventory.mods.push(item.record)
inventory.modCount = inventory.mods.length
assert.equal(inventory.modCount, inventoryBefore.modCount + 1)
assert.deepEqual(before.servers.filter(server => server.id !== 'tokemon'), distro.servers.filter(server => server.id !== 'tokemon'))
const oldServer = before.servers.find(server => server.id === 'tokemon')
assert.deepEqual({ ...oldServer, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(oldServer.modules.filter(module => !isChanged(module)), server.modules.filter(module => !isChanged(module)))
assert.deepEqual(inventoryBefore.mods.filter(mod => !ids.has(mod.id)).sort((a, b) => a.id.localeCompare(b.id)), inventory.mods.filter(mod => !ids.has(mod.id)).sort((a, b) => a.id.localeCompare(b.id)))
for (const item of replacements) fs.copyFileSync(item.source, path.join(root, item.relative), fs.constants.COPYFILE_EXCL)
write(path.join(root, 'distribution.json'), distro)
write(path.join(root, 'docs/packs/tokemon-files.json'), inventory)
const notes = `Tokemon pack ${version}\n\nAdd required tokemon_factory_gui 0.1.0 and replace tokemon_shop 0.2.0 with 0.2.2.\nThese exact client artifacts match the installed and verified Tokemon server.\nThe other ${inventory.modCount - 2} Fabric mods, loader, Korean resource pack, default options,\nserver address, Java/RAM configuration and other servers are unchanged.\n\nKTZ 3.4.2 refreshes distribution.json before PLAY. Its existing download validator\nfetches the new content-addressed artifacts and ProcessBuilder writes only the\ncurrent module list to --fabric.addMods @forgeMods.list. Cached old shop JARs\nare preserved in the cache but excluded from the new launch list.\nNo launcher executable update or manual mod copy is required.\n\nSelect Tokemon in KTZ and press PLAY after closing an already-running game.\nUse /배틀팩토리, /팩토리PC or /팩토리알 in game.\nNewly hatched Lv.1 Pokemon must be trained before battling under the current server rules.\n\n${replacements.map(item => item.record.id + ': ' + item.record.sha256).join('\n')}\n\nPublishing, managed download/launch-list checks and authenticated gameplay are\nreported separately. Automated checks do not imply human gameplay review.\n`
fs.writeFileSync(path.join(root, `docs/packs/tokemon-${version}.txt`), notes)
write(path.join(work, 'staging.json'), { createdAt: new Date().toISOString(), version, oldVersion: oldServer.version, modCount: inventory.modCount, root, backup, protectedFiles, instance, changes: replacements.map(({ relative, record, from }) => ({ relative, record, from })), otherServersPreserved: true, otherModsPreserved: true, settingsAndJavaUnchanged: true })
console.log(JSON.stringify({ version, modCount: inventory.modCount, changedMods: replacements.length, addedMods: 1, work }))
