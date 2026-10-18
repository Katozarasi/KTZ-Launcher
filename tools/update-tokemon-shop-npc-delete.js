const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-ShopNPC-Delete-20261018'
const source = 'C:/codex/Builds/Tokemon-Shop-NPC-Delete-20261018/build/libs/tokemon-shop-0.3.1.jar'
const expectedSha256 = '61636b8f3c9340ea745efa2ae4d13978d5579f68b1be58832d7d4b1e0cb10c08'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const before = read(path.join(root, 'distribution.json'))
const inventoryBefore = read(path.join(root, 'docs/packs/tokemon-files.json'))
const candidate = structuredClone(before)
const server = candidate.servers.find(server => server.id === 'tokemon')
const old = before.servers.find(server => server.id === 'tokemon')
assert.equal(old.version, '2026.10.18.8', 'Distribution changed: rebase first')
assert.equal(inventoryBefore.modCount, 46)
assert.equal(inventoryBefore.mods.length, 46)
const previous = inventoryBefore.mods.find(mod => mod.id === 'tokemon_shop')
assert.equal(previous.version, '0.3.0')
assert.equal(previous.sha256, 'a36b170eb6c6bbcc23b8c236eb7819d3f02429133e274a7eb314536b324c39c8')

const bytes = fs.readFileSync(source)
assert.equal(hash(bytes), expectedSha256, 'Shop differs from the verified release candidate')
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_shop')
assert.equal(meta.version, '0.3.1')
assert.equal(meta.environment, '*')
assert.ok(!archive.getEntries().some(entry => entry.entryName.startsWith('dev/tokemon/shopqa/')), 'QA classes must not be distributed')
const relative = 'files/mods/tokemon/' + path.basename(source)
assert.ok(!fs.existsSync(path.join(root, relative)), 'Release artifact already exists')
const record = {
    file: path.basename(source), id: meta.id, version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative, custom: true
}
const changed = module => module.id.startsWith('ktz.tokemon:tokemon_shop:')
assert.equal(server.modules.filter(changed).length, 1)
const index = server.modules.findIndex(changed)
server.modules[index] = {
    id: 'ktz.tokemon:' + record.id + ':' + record.sha256.slice(0, 12),
    name: record.id + ' ' + record.version, type: 'FabricMod', required: { value: true },
    artifact: { size: record.size, MD5: record.md5, url: record.url }
}
server.version = '2026.10.18.9'
const inventory = structuredClone(inventoryBefore)
inventory.mods = inventory.mods.map(mod => mod.id === record.id ? record : mod)
assert.deepEqual({ ...server, modules: [], version: '' }, { ...old, modules: [], version: '' })
assert.deepEqual(old.modules.filter(module => !changed(module)), server.modules.filter(module => !changed(module)))
assert.deepEqual(before.servers.filter(server => server.id !== 'tokemon'), candidate.servers.filter(server => server.id !== 'tokemon'))
assert.deepEqual(inventoryBefore.mods.filter(mod => mod.id !== record.id), inventory.mods.filter(mod => mod.id !== record.id))
assert.equal(inventory.modCount, 46)

const backup = path.join(work, 'backup')
fs.mkdirSync(backup, { recursive: true })
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const destination = path.join(backup, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL)
}
const user = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(path.join(user, 'config.json'))
const instance = path.join(config.settings.launcher.dataDirectory, 'instances', 'tokemon')
fs.mkdirSync(path.join(backup, 'private'))
const protectedFiles = [path.join(user, 'config.json'), path.join(instance, 'options.txt')]
    .filter(fs.existsSync).map((file, index) => {
        const destination = path.join(backup, 'private', index + '-' + path.basename(file))
        fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL)
        return { file, backup: destination, sha256: hash(fs.readFileSync(file)) }
    })
const untouchedRuntimeFiles = [path.join(user, 'distribution.json'), path.join(instance, 'forgeMods.list')]
    .filter(fs.existsSync).map((file, index) => {
        const destination = path.join(backup, 'private', 'runtime-' + index + '-' + path.basename(file))
        fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL)
        return { file, backup: destination, sha256: hash(fs.readFileSync(file)) }
    })

fs.copyFileSync(source, path.join(root, relative), fs.constants.COPYFILE_EXCL)
write(path.join(root, 'distribution.json'), candidate)
write(path.join(root, 'docs/packs/tokemon-files.json'), inventory)
write(path.join(work, 'staging.json'), {
    createdAt: new Date().toISOString(), version: server.version, oldVersion: old.version, modCount: 46,
    root, backup, instance, protectedFiles, untouchedRuntimeFiles,
    changes: [{ relative, record, source, from: previous.version }],
    unchangedModCount: 45, otherServersPreserved: true, otherModsPreserved: true, settingsAndJavaUnchanged: true
})
fs.writeFileSync(path.join(root, 'docs/packs/tokemon-2026.10.18.9.txt'), `Tokemon pack 2026.10.18.9

Shop 0.3.1 adds admin commands to delete one nearby shop NPC: /상점 npc 삭제 [이름]. Only tagged shopkeepers within eight blocks are eligible. Other NPCs are preserved.
Each NPC opens its assigned category; server-side purchase, sale and bulk sale checks use that category.
AP/BP shops select the matching currency. Sell-only categories open the selling tab.
The regular /shop and /상점 commands still open the complete shop.
Existing prices, balances, personal stock, rewards and factory inventory APIs are preserved.

Close an already-running game, select Tokemon in KTZ, then PLAY. No launcher executable reinstall is needed.
All other 45 mods, resource packs, Java, options, server endpoints and other launcher servers are unchanged.

tokemon_shop SHA256 ${record.sha256}

Native managed-download and launch-list verification does not imply authenticated human gameplay review.
`)
console.log(JSON.stringify({ version: server.version, modCount: 46, updated: 1, unchanged: 45, sha256: record.sha256, work }))
