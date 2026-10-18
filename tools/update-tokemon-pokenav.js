const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')
const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-PokeNav-20261018'
const source = 'C:/codex/Builds/Tokemon-PokeNav-Korean-20261018'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const before = read(root + '/distribution.json')
const inventoryBefore = read(root + '/docs/packs/tokemon-files.json')
const candidate = structuredClone(before)
const server = candidate.servers.find(server => server.id === 'tokemon')
assert.equal(server.version, '2026.10.18.7', 'Review concurrent pack updates before staging')
assert.equal(inventoryBefore.modCount, 44)
for (const file of ['C:/codex/Builds/Tokemon-PokeNav-KoreanQA-20261018/server/nav-server-qa.json', 'C:/codex/Builds/Tokemon-PokeNav-KoreanQA-20261018/server/wildcap-qa.json', 'C:/codex/Builds/Tokemon-PokeNav-KoreanClientQA-20261018/guide-client-qa.json']) assert.ok(read(file).passed, file)
const backup = work + '/backup'
assert.ok(!fs.existsSync(backup), 'Preserve existing backup')
fs.mkdirSync(backup, { recursive: true })
for (const relative of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const target = path.join(backup, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, relative), target, fs.constants.COPYFILE_EXCL)
}
const launcher = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(launcher + '/config.json')
const instance = path.join(config.settings.launcher.dataDirectory, 'instances/tokemon')
fs.mkdirSync(backup + '/private')
const protectedFiles = [launcher + '/config.json', instance + '/options.txt'].filter(file => fs.existsSync(file)).map((file, i) => {
    const copy = backup + '/private/' + i + '-' + path.basename(file)
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL)
    return { file, backup: copy, sha256: digest(fs.readFileSync(file)) }
})
const upstream = read(source + '/modrinth-version.json')
const official = upstream.files.find(file => file.primary)
const selected = [
    { file: 'C:/codex/Cache/Modrinth/Tokemon-ScannerNav-Review-20261018/cobblenav-fabric-2.4.2.jar', id: 'cobblenav', url: official.url, custom: false },
    { file: source + '/build/libs/tokemon-korean-guide-0.1.0.jar', id: 'tokemon_korean_guide', url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/files/mods/tokemon/tokemon-korean-guide-0.1.0.jar', custom: true }
]
const inventory = structuredClone(inventoryBefore)
const changes = selected.map(item => {
    const bytes = fs.readFileSync(item.file)
    if (!item.custom) assert.equal(digest(bytes, 'sha512'), official.hashes.sha512)
    const meta = JSON.parse(new AdmZip(bytes).readAsText('fabric.mod.json'))
    assert.equal(meta.id, item.id)
    if (item.custom) assert.equal(meta.environment, 'client')
    const record = { file: path.basename(item.file), id: item.id, version: meta.version, size: bytes.length, md5: digest(bytes, 'md5'), sha256: digest(bytes), sha512: digest(bytes, 'sha512'), url: item.url, custom: item.custom }
    assert.ok(!server.modules.some(module => module.id.startsWith(`ktz.tokemon:${item.id}:`)))
    if (item.custom) fs.copyFileSync(item.file, root + '/files/mods/tokemon/' + record.file, fs.constants.COPYFILE_EXCL)
    server.modules.push({ id: `ktz.tokemon:${item.id}:${record.sha256.slice(0, 12)}`, name: `${item.id} ${meta.version}`, type: 'FabricMod', required: { value: true }, artifact: { size: record.size, MD5: record.md5, url: record.url } })
    inventory.mods.push(record)
    return { record, kind: 'mod', localFile: item.file, artifactPath: null }
})
server.version = '2026.10.18.8'
inventory.modCount = inventory.mods.length
assert.equal(inventory.modCount, 46)
const old = before.servers.find(server => server.id === 'tokemon')
assert.deepEqual(before.servers.filter(server => server.id !== 'tokemon'), candidate.servers.filter(server => server.id !== 'tokemon'))
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(old.modules, server.modules.slice(0, -2))
assert.deepEqual(inventoryBefore.mods, inventory.mods.slice(0, -2))
write(root + '/distribution.json', candidate)
write(root + '/docs/packs/tokemon-files.json', inventory)
fs.writeFileSync(root + '/docs/packs/tokemon-2026.10.18.8.txt', [
    '토켓몬 팩 2026.10.18.8', '',
    '포케나브 2.4.2와 한국어 안내 모듈 0.1.0 추가. 원본 551개 언어 항목 번역.',
    '서버의 searchAreaWidth / searchAreaHeight 설정은 각각 64입니다.',
    'Utility+ 38종 이름과 각 3줄 설명을 한글로 표시합니다. 기본 IV·특훈 IV·노력치·사용 조건을 구분합니다.',
    '나무왕관은 실제 코드 기준으로 기본 IV 6종을 각각 1~31로 다시 뽑으며 특훈 IV는 유지됩니다.',
    '원본 아이템 성능·제작법은 변경하지 않습니다. 별도 리소스팩 활성화가 필요 없습니다.', '',
    '게임 종료 후 KTZ 토켓몬 PLAY를 눌러 업데이트하세요. 런처 재설치는 필요 없습니다.',
    '포케나브를 손에 들고 우클릭하면 현재 지역 출현 정보를 볼 수 있습니다.',
    '일반 야생 배틀은 레벨캡 초과 개체도 출전 가능. 관장·트레이너·레이드·PvP 제한은 유지합니다.',
    '경험치 성장 캡·포획 보정·Lv.1 전투 금지는 유지합니다.',
    '뼈 블록 제한은 별도 적용 대기 상태입니다.', '',
    '기존 44개 모드·리소스팩·게임 설정·Java·메모리·주소·다른 서버 구성은 보존합니다.',
    '격리 클라이언트와 실제 운영 계정 플레이 검증은 구분합니다.', ''
].join('\n'))
write(work + '/staging.json', { createdAt: new Date().toISOString(), version: server.version, oldVersion: old.version, modCount: inventory.modCount, root, backup, instance, protectedFiles, changes, otherServersPreserved: true, otherModsPreserved: true, settingsAndJavaUnchanged: true, serverActivationRequired: true })
console.log(JSON.stringify({ version: server.version, addedMods: 2, modCount: inventory.modCount, work }))
