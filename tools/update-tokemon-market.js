const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-Market-20261022'
const qa = 'C:/codex/Builds/Tokemon-FleaMarket-20261021/qa'
const source = 'C:/codex/Builds/Tokemon-FleaMarket-20261021/build/libs/tokemon-market-0.1.0.jar'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
for (const name of ['native-operational-dependencies.json', 'native-launcher-dependencies.json', 'client.json']) assert.equal(read(qa + '/reports/' + name).status, 'PASS')
for (const name of ['client-before-restart.json', 'client-after-restart.json']) assert.equal(read(qa + '/e2e/' + name).status, 'PASS')
const staged = read('C:/codex/Projects/Tokemon/reports/flea-market-20261021/staged.json')
const bytes = fs.readFileSync(source)
assert.equal(hash(bytes), staged.plan.sha256)
const archive = new AdmZip(bytes)
const meta = JSON.parse(archive.readAsText('fabric.mod.json'))
assert.equal(meta.id, 'tokemon_market')
assert.equal(meta.version, '0.1.0')
assert.ok(!archive.getEntries().some(entry => /\/(?:qa|clientqa)\//.test(entry.entryName)), 'QA classes must never be published')

const distributionFile = path.join(root, 'distribution.json')
const inventoryFile = path.join(root, 'docs/packs/tokemon-files.json')
const originalDistribution = fs.readFileSync(distributionFile)
const originalInventory = fs.readFileSync(inventoryFile)
const before = JSON.parse(originalDistribution), inventoryBefore = JSON.parse(originalInventory)
const candidate = structuredClone(before), inventory = structuredClone(inventoryBefore)
const old = before.servers.find(server => server.id === 'tokemon')
const server = candidate.servers.find(server => server.id === 'tokemon')
assert.equal(old.modules.filter(module => module.type === 'FabricMod').length, inventoryBefore.modCount)
assert.equal(inventoryBefore.mods.length, inventoryBefore.modCount)
assert.ok(!inventoryBefore.mods.some(mod => mod.id === meta.id))
assert.ok(!server.modules.some(module => module.id.startsWith('ktz.tokemon:tokemon_market:')))
const releaseDay = '2026.10.22'
const version = old.version.startsWith(releaseDay + '.') ? old.version.replace(/\d+$/, n => String(Number(n) + 1)) : releaseDay + '.1'
const relative = 'files/mods/tokemon/tokemon-market-0.1.0.jar'
assert.ok(!fs.existsSync(path.join(root, relative)), 'Preserve existing release artifact')
const record = { file: path.basename(relative), id: meta.id, version: meta.version, size: bytes.length,
    md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'),
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative, custom: true }
server.modules.push({ id: 'ktz.tokemon:tokemon_market:' + record.sha256.slice(0, 12), name: 'tokemon_market 0.1.0',
    type: 'FabricMod', required: { value: true }, artifact: { size: record.size, MD5: record.md5, url: record.url } })
server.version = version
inventory.mods.push(record)
inventory.modCount++
assert.deepEqual(old.modules, server.modules.slice(0, -1))
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual({ ...before, servers: [] }, { ...candidate, servers: [] })
assert.deepEqual(before.servers.filter(item => item.id !== 'tokemon'), candidate.servers.filter(item => item.id !== 'tokemon'))
assert.deepEqual(inventoryBefore.mods, inventory.mods.slice(0, -1))
assert.deepEqual({ ...inventoryBefore, mods: [], modCount: 0 }, { ...inventory, mods: [], modCount: 0 })

const backup = path.join(work, 'backup')
assert.ok(!fs.existsSync(backup), 'Preserve prior release backup')
fs.mkdirSync(backup, { recursive: true })
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const target = path.join(backup, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL)
}
assert.equal(hash(fs.readFileSync(distributionFile)), hash(originalDistribution), 'Concurrent distribution change')
assert.equal(hash(fs.readFileSync(inventoryFile)), hash(originalInventory), 'Concurrent inventory change')
fs.copyFileSync(source, path.join(root, relative), fs.constants.COPYFILE_EXCL)
write(distributionFile, candidate)
write(inventoryFile, inventory)
fs.writeFileSync(path.join(root, 'docs/packs/tokemon-' + version + '.txt'), `Tokemon pack ${version}

Adds the Shift+F card flea market: seven cards per row, no categories, name search and price sorting. Only Pokemon cards may be listed, with at most three active listings per player and no cards with three or more natural perfect IVs. Listings expire after 24 real hours; expired or cancelled cards remain in custody until the owner presses Reclaim. Full inventories retain custody. Native Pokemon forms and shiny appearances are rendered on cards.

Uses existing WON accounts with confirmation and replay-safe payment. Basic Cobblemon trading and card transfers through drops, foreign containers, backpacks, hoppers and droppers are blocked; own-land chests and death preservation are supported.

Relaunch Minecraft through KTZ to load the client. The server component is staged separately for the next normal server start. The running production server was not restarted. Existing mods, other server packs and player settings are preserved.

Market 0.1.0 SHA256 ${record.sha256}

Verified by 37 ledger checks, 38 isolated native checks for each of two dependency combinations, eight installer checks, rendered UI checks and client/server purchase, registration, reclaim and restart-custody scenarios. The 24-hour expiry boundary was advanced in the disposable test fixture; no 24-hour wall-clock wait or authenticated production-player gameplay is claimed.
`)
write(work + '/release.json', { status: 'LOCAL_RELEASE_READY', at: new Date().toISOString(), version, previousVersion: old.version,
    record, modCount: inventory.modCount, preservedMods: inventoryBefore.modCount, otherServersPreserved: true,
    serverActive: false, nextNormalRestart: true, source, backup })
console.log(JSON.stringify({ version, modCount: inventory.modCount, sha256: record.sha256, work }))
