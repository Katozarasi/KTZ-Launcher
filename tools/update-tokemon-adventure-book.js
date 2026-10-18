const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')
const root = 'C:/codex/Projects/KTZ-Launcher'
const work = 'C:/codex/Builds/Tokemon-AdventureDeploy-20261018'
const release = 'C:/codex/Projects/Tokemon/dist/Tokemon-AdventureBook-0.1.0'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const original = fs.readFileSync(root + '/distribution.json')
const originalInventory = fs.readFileSync(root + '/docs/packs/tokemon-files.json')
const before = JSON.parse(original.toString('utf8'))
const inventoryBefore = JSON.parse(originalInventory.toString('utf8'))
const candidate = structuredClone(before)
const server = candidate.servers.find(s => s.id === 'tokemon')
const old = before.servers.find(s => s.id === 'tokemon')
assert.equal(inventoryBefore.modCount, inventoryBefore.mods.length)
const manifest = read(release + '/release-manifest.json')
assert.equal(manifest.coreTest.includes('PASS'), true)
assert.equal(manifest.qa['adventure-native-qa.json'].passed, true)
assert.equal(manifest.qa['adventure-restart-qa.json'].passed, true)
const records = []
for (const file of fs.readdirSync(release + '/client/mods').sort()) {
    const bytes = fs.readFileSync(release + '/client/mods/' + file)
    assert.equal(hash(bytes), manifest.files['client/mods/' + file])
    const metadata = JSON.parse(new AdmZip(bytes).readAsText('fabric.mod.json'))
    assert.ok(['ftblibrary', 'ftbquests', 'ftbteams'].includes(metadata.id))
    assert.ok(!inventoryBefore.mods.some(mod => mod.id === metadata.id), 'Existing FTB mod needs a separate upgrade review')
    const artifact = file.replace(/-[0-9].*$/, '')
    const url = 'https://maven.ftb.dev/releases/dev/ftb/mods/' + artifact + '/' + metadata.version + '/' + file
    const record = { file, id: metadata.id, version: metadata.version, size: bytes.length,
        md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'), url, custom: false }
    server.modules.push({ id: 'ktz.tokemon:' + metadata.id + ':' + record.sha256.slice(0, 12),
        name: metadata.name + ' ' + metadata.version, type: 'FabricMod', required: { value: true },
        artifact: { size: record.size, MD5: record.md5, url } })
    records.push(record)
}
assert.equal(records.length, 3)
const version = old.version.replace(/\d+$/, n => String(Number(n) + 1))
assert.notEqual(version, old.version)
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods.push(...records)
inventory.modCount = inventory.mods.length
assert.deepEqual(old.modules, server.modules.slice(0, -3))
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(before.servers.filter(s => s.id !== 'tokemon'), candidate.servers.filter(s => s.id !== 'tokemon'))
assert.deepEqual(inventoryBefore.mods, inventory.mods.slice(0, -3))
const backup = work + '/launcher-repository-backup'
assert.ok(!fs.existsSync(backup), 'Preserve existing staging backup')
for (const file of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    fs.mkdirSync(path.dirname(backup + '/' + file), { recursive: true })
    fs.copyFileSync(root + '/' + file, backup + '/' + file, fs.constants.COPYFILE_EXCL)
}
assert.equal(hash(fs.readFileSync(root + '/distribution.json')), hash(original), 'Concurrent distribution edit')
assert.equal(hash(fs.readFileSync(root + '/docs/packs/tokemon-files.json')), hash(originalInventory), 'Concurrent inventory edit')
write(root + '/distribution.json', candidate)
write(root + '/docs/packs/tokemon-files.json', inventory)
write(root + '/docs/packs/tokemon-adventure-book.json', {
    packVersion: version, adventureVersion: '0.1.0', minecraft: '1.21.1', additions: records,
    serverAdapter: { id: 'tokemon_adventure', version: '0.1.0', environment: 'server', clientRequired: false },
    quests: 36, chapters: 6, guideQuests: 16, automaticQuests: 20,
    maximumOneTimeReward: { BP: 74, AP: 3 }, repeatableRewards: false,
    commands: ['/모험수첩', '/모험수첩 진행', '/모험수첩 보상'],
    progression: 'Uses the server Pokedex OWNED records, actual badges, persisted Factory best streak and post-install evolution events.',
    existingWorldAndProgressPreserved: true, otherClientModulesPreserved: inventoryBefore.modCount,
    serverQuestDefinitions: 'Synced by FTB Quests from the server; no client world, quest progress or user options file is shipped.'
})
fs.writeFileSync(root + '/docs/packs/tokemon-' + version + '.txt', [
    '토켓몬 팩 ' + version, '',
    '토켓몬 모험 수첩 0.1.0: 6개 챕터, 36개 항목.',
    'FTB Quests / FTB Library / FTB Teams를 추가합니다. 서버 전용 어댑터는 클라이언트에 넣지 않습니다.',
    '/모험수첩 으로 열기 · /모험수첩 진행 으로 현황 · /모험수첩 보상 으로 지급 재확인.',
    '각 목표는 개인별 1회만 수령합니다. 전체 보상 합계 74 BP / 3 AP.',
    '기존 월드·배지·포켓몬·재화·상점·런처 설정·Java 설정·키 설정을 유지합니다.',
    '게임을 종료한 뒤 KTZ에서 토켓몬 PLAY를 누르면 새 모드를 받습니다. 런처 재설치는 필요 없습니다.', ''
].join('\n'))
write(work + '/launcher-staging.json', { createdAt: new Date().toISOString(), version, oldVersion: old.version,
    modCount: inventory.modCount, records, protectedModuleCount: old.modules.length, originalModCount: inventoryBefore.modCount,
    otherServersPreserved: true, otherModsPreserved: true, addressPreserved: old.address, backup })
console.log(JSON.stringify({ version, modCount: inventory.modCount, records: records.map(r => ({ id: r.id, version: r.version, url: r.url })) }))
