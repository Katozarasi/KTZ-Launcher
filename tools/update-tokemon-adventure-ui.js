const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const root = 'C:/codex/Projects/KTZ-Launcher'
const source = 'C:/codex/Projects/Tokemon/adventure-ui'
const work = 'C:/codex/Builds/Tokemon-AdventureUI-20261018'
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const hash = (b, algorithm = 'sha256') => crypto.createHash(algorithm).update(b).digest('hex')
const write = (p, j) => fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
const build = read(read(source + '/build-result.json').manifest)
const translations = read(work + '/language-verification.json')
assert.equal(Object.values(translations).reduce((a, b) => a + b.translated, 0), 997)
const old = read(root + '/distribution.json')
const inventoryBefore = read(root + '/docs/packs/tokemon-files.json')
const next = structuredClone(old)
const server = next.servers.find(s => s.id === 'tokemon')
const previous = old.servers.find(s => s.id === 'tokemon')
assert.ok(!inventoryBefore.mods.some(m => m.id === 'tokemon_adventure_ui'))
const bytes = fs.readFileSync(build.jar)
assert.equal(hash(bytes), build.sha256)
const file = path.basename(build.jar)
const relative = 'files/packs/tokemon/mods/' + file
const url = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/' + relative
const record = { file, id: 'tokemon_adventure_ui', version: build.version, size: bytes.length, md5: hash(bytes, 'md5'), sha256: hash(bytes), sha512: hash(bytes, 'sha512'), url, custom: true, environment: 'client' }
server.modules.push({ id: 'ktz.tokemon:tokemon_adventure_ui:' + record.sha256.slice(0, 12), name: '토켓몬 모험 수첩 한글화 ' + build.version, type: 'FabricMod', required: { value: true }, artifact: { size: record.size, MD5: record.md5, url } })
const version = previous.version.replace(/\d+$/, n => String(Number(n) + 1))
server.version = version
const inventory = structuredClone(inventoryBefore)
inventory.mods.push(record)
inventory.modCount = inventory.mods.length
assert.deepEqual(server.modules.slice(0, -1), previous.modules)
assert.deepEqual({ ...server, modules: [], version: '' }, { ...previous, modules: [], version: '' })
assert.deepEqual(next.servers.filter(s => s.id !== 'tokemon'), old.servers.filter(s => s.id !== 'tokemon'))
const backup = work + '/launcher-backup'
for (const p of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    fs.mkdirSync(path.dirname(backup + '/' + p), { recursive: true })
    if (fs.existsSync(backup + '/' + p)) assert.deepEqual(fs.readFileSync(root + '/' + p), fs.readFileSync(backup + '/' + p), 'Deployment base changed: ' + p)
    else fs.copyFileSync(root + '/' + p, backup + '/' + p)
}
assert.ok(!fs.existsSync(root + '/' + relative))
fs.mkdirSync(path.dirname(root + '/' + relative), { recursive: true })
fs.copyFileSync(build.jar, root + '/' + relative)
write(root + '/distribution.json', next)
write(root + '/docs/packs/tokemon-files.json', inventory)
write(root + '/docs/packs/tokemon-adventure-ui.json', { packVersion: version, clientMod: record, translatedStrings: translations,
    ftbKeyDefaults: 'All 37 FTB mappings are unbound. Commands, mouse navigation and Escape remain available.',
    existingClientMigration: 'Only FTB key mappings are cleared once per client. Non-FTB mappings and other settings are preserved. Later player assignments remain editable.',
    serverChange: 'Only quest translations are updated and reloaded. Quest IDs, progress, reward receipts and BP/AP amounts are preserved.' })
fs.writeFileSync(root + '/docs/packs/tokemon-' + version + '.txt', [
    '토켓몬 팩 ' + version, '', '수첩 화면 한글화: 토켓몬 모험 수첩 / 달성 조건 / 달성 보상 / 모두 받기.',
    '수첩·공통 화면·팀 설정의 번역 문구 997개를 한글로 적용합니다.',
    'FTB 단축키 37개는 기본 지정 해제합니다. 기존 설치도 첫 실행 때 FTB 항목만 한 번 해제합니다.',
    '기존 포켓몬·전투·지도 키와 다른 설정을 유지하며, 이후 직접 지정한 키는 유지합니다.',
    '수첩은 /모험수첩, 마우스, ESC로 이용하세요.',
    '현재 게임은 종료하지 않습니다. 다음에 종료 후 KTZ PLAY로 실행하면 적용됩니다.',
    '월드·유저 진행·수첩 보상 수령 기록·BP/AP 보상 금액은 유지됩니다.', ''
].join('\n'))
write(work + '/launcher-staging.json', { at: new Date().toISOString(), version, oldVersion: previous.version, modCount: inventory.modCount, oldModCount: inventoryBefore.modCount, record, relative, backup, oldModulesPreserved: previous.modules.length })
console.log(JSON.stringify({ version, mods: inventory.modCount, sha256: record.sha256 }))
