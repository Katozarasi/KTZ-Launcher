const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('C:/codex/Projects/KTZ-Launcher/node_modules/adm-zip')
const root = 'C:/codex/Projects/KTZ-Launcher'
const work = 'C:/codex/Builds/KTZ-Tokemon-ShopUI-20261018'
const candidateFile = 'C:/codex/Projects/Tokemon/reports/shop-ui-upgrade-20261018/candidate.json'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const checked = read(candidateFile)
assert.equal(checked.version, '0.4.0')
assert.equal(checked.nativeQaPassed, true, 'Native QA must be completed before distribution')
assert.equal(checked.tradeQaPassed, true, 'Trade QA must be completed before distribution')
const bytes = fs.readFileSync(checked.jar)
assert.equal(hash(bytes), checked.sha256)
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_shop')
assert.equal(meta.version, '0.4.0')
assert.equal(meta.environment, '*')
assert.ok(!archive.getEntries().some(entry => entry.entryName.startsWith('dev/tokemon/shopqa/')))
const distributionFile = root + '/distribution.json'
const inventoryFile = root + '/docs/packs/tokemon-files.json'
const originalDistribution = fs.readFileSync(distributionFile)
const originalInventory = fs.readFileSync(inventoryFile)
const before = JSON.parse(originalDistribution.toString('utf8'))
const inventoryBefore = JSON.parse(originalInventory.toString('utf8'))
const candidate = structuredClone(before)
const server = candidate.servers.find(item => item.id === 'tokemon')
const old = before.servers.find(item => item.id === 'tokemon')
const previous = inventoryBefore.mods.find(mod => mod.id === meta.id)
assert.ok(['0.3.0', '0.3.1'].includes(previous.version), 'Review any newer shop release before replacing it')
assert.equal(inventoryBefore.modCount, inventoryBefore.mods.length)
assert.match(old.version, /^2026\.10\.18\.\d+$/)
const version = old.version.replace(/\d+$/, n => String(Number(n) + 1))
const relative = 'files/mods/tokemon/tokemon-shop-0.4.0.jar'
assert.ok(!fs.existsSync(root + '/' + relative), 'Preserve existing artifact and review')
const record = { file: path.basename(relative), id: meta.id, version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative, custom: true }
const changed = module => module.id.startsWith('ktz.tokemon:tokemon_shop:')
assert.equal(server.modules.filter(changed).length, 1)
server.modules[server.modules.findIndex(changed)] = { id: 'ktz.tokemon:tokemon_shop:' + record.sha256.slice(0, 12),
    name: 'tokemon_shop 0.4.0', type: 'FabricMod', required: { value: true },
    artifact: { size: record.size, MD5: record.md5, url: record.url } }
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods = inventory.mods.map(mod => mod.id === meta.id ? record : mod)
assert.deepEqual(old.modules.filter(module => !changed(module)), server.modules.filter(module => !changed(module)))
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(before.servers.filter(item => item.id !== 'tokemon'), candidate.servers.filter(item => item.id !== 'tokemon'))
assert.deepEqual(inventoryBefore.mods.filter(mod => mod.id !== meta.id), inventory.mods.filter(mod => mod.id !== meta.id))
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
const protectedFiles = protect([user + '/config.json', instance + '/options.txt'], 'settings-')
const untouchedRuntimeFiles = protect([user + '/distribution.json', instance + '/forgeMods.list'], 'runtime-')
assert.equal(hash(fs.readFileSync(distributionFile)), hash(originalDistribution), 'Concurrent distribution update: rebase')
assert.equal(hash(fs.readFileSync(inventoryFile)), hash(originalInventory), 'Concurrent inventory update: rebase')
fs.copyFileSync(checked.jar, root + '/' + relative, fs.constants.COPYFILE_EXCL)
write(distributionFile, candidate)
write(inventoryFile, inventory)
write(work + '/staging.json', { createdAt: new Date().toISOString(), version, oldVersion: old.version,
    modCount: inventory.modCount, root, backup, instance, protectedFiles, untouchedRuntimeFiles,
    changes: [{ relative, record, source: checked.jar, from: previous.version }],
    unchangedModCount: inventory.modCount - 1, otherServersPreserved: true, otherModsPreserved: true, settingsAndJavaUnchanged: true })
fs.writeFileSync(root + '/docs/packs/tokemon-' + version + '.txt', `Tokemon pack ${version}\n\nShop 0.4.0 adds smooth Korean typography, rounded large product cards, responsive scrolling, central quantity and inventory details, server-owned itemized sale quotes, exclusions, richer item descriptions, stock refresh and visible trade feedback.\nNPC category scope and delete/admin functions are preserved. Prices, balances, stock policy, factory/rewards and all unrelated modules remain unchanged.\n\nThe server update is staged for the operator's next normal stop/start. The launcher can update first; unsupported bulk exclusions are gated until server UI capability 4 is present.\nClose the running game and PLAY Tokemon in KTZ to load the new client. No launcher executable reinstall is needed.\n\nShop SHA256 ${record.sha256}\n\nIsolated native game QA and launcher download/list checks do not claim an authenticated production player trade.\n`)
console.log(JSON.stringify({ version, oldVersion: old.version, modCount: inventory.modCount, sha256: record.sha256, work }))
