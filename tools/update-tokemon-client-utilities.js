const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const work = 'C:/codex/Builds/KTZ-Tokemon-KoreanChat-20261018'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const before = read(root + '/distribution.json')
const inventoryBefore = read(root + '/docs/packs/tokemon-files.json')
const candidate = structuredClone(before)
const server = candidate.servers.find(item => item.id === 'tokemon')
assert.equal(server.version, '2026.10.18.4', 'Rebase on the current pack before changing it')
assert.equal(inventoryBefore.minecraft, '1.21.1')
assert.equal(inventoryBefore.loader, '0.18.4')
assert.equal(inventoryBefore.modCount, 42)
const backup = work + '/backup'
assert.ok(!fs.existsSync(backup), 'Preserve existing backup')
fs.mkdirSync(backup)
for (const relative of ['distribution.json', 'docs/packs/tokemon-files.json', 'admin/servers.json']) {
    const target = path.join(backup, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, relative), target, fs.constants.COPYFILE_EXCL)
}
const launcher = 'C:/Users/nabar/AppData/Roaming/KTZ Launcher'
const config = read(launcher + '/config.json')
const instance = path.join(config.settings.launcher.dataDirectory, 'instances/tokemon')
fs.mkdirSync(backup + '/private')
const protectedFiles = [launcher + '/config.json', instance + '/options.txt'].filter(file => fs.existsSync(file)).map((file, index) => {
    const copy = backup + '/private/' + index + '-' + path.basename(file)
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL)
    return { file, backup: copy, sha256: digest(fs.readFileSync(file)) }
})
const selected = [
    { version: read(work + '/modrinth-version.json'), file: 'C:/codex/Cache/Modrinth/korean-chat-patch/koreanpatch-fabric-1.9.6+mc1.21.jar', id: 'koreanpatch', kind: 'mod' },
    { version: read(work + '/journeymap-versions.json').find(item => item.id === 'i7LuKuDl'), file: 'C:/codex/Cache/Modrinth/journeymap/journeymap-fabric-1.21.1-6.0.9.jar', id: 'journeymap', kind: 'mod' },
    { version: read(work + '/azoth-versions.json').find(item => item.id === 'hxaKqFs6'), file: 'C:/codex/Cache/Modrinth/azoth-cobblemon-minimap-icons/AZOTH_JourneyMap_Icons-1.8.3.zip', id: 'azoth_journeymap_icons', kind: 'resourcepack' },
    { version: read(work + '/sodium-translations-versions.json').find(item => item.id === 'zKydr9Li'), file: 'C:/codex/Cache/Modrinth/translations-for-sodium/SodiumTranslations-v8.20.0.zip', id: 'sodium_translations', kind: 'resourcepack' }
]
const inventory = structuredClone(inventoryBefore)
const changes = selected.map(item => {
    const upstream = item.version.files.find(file => file.primary) || item.version.files[0]
    const bytes = fs.readFileSync(item.file)
    assert.equal(bytes.length, upstream.size)
    assert.equal(digest(bytes, 'sha512'), upstream.hashes.sha512)
    assert.ok(item.version.game_versions.includes('1.21.1'))
    let version = item.version.version_number
    if (item.kind === 'mod') {
        const meta = JSON.parse(new AdmZip(bytes).readAsText('fabric.mod.json'))
        assert.equal(meta.id, item.id)
        assert.ok(item.version.loaders.includes('fabric'))
        if (item.id === 'koreanpatch') assert.equal(meta.environment, 'client')
        version = meta.version
    }
    const record = { file: path.basename(item.file), id: item.id, version, size: bytes.length, md5: digest(bytes, 'md5'), sha256: digest(bytes), sha512: digest(bytes, 'sha512'), url: upstream.url, custom: false, projectId: item.version.project_id, versionId: item.version.id }
    const module = { id: `ktz.tokemon:${record.id}:${record.sha256.slice(0, 12)}`, name: `${record.id} ${version}`, type: item.kind === 'mod' ? 'FabricMod' : 'File', required: { value: true }, artifact: { size: record.size, MD5: record.md5, url: record.url } }
    assert.ok(!server.modules.some(existing => existing.id.startsWith(`ktz.tokemon:${record.id}:`)), 'Already present: ' + record.id)
    if (item.kind === 'resourcepack') module.artifact.path = 'resourcepacks/' + record.file
    else inventory.mods.push(record)
    server.modules.push(module)
    return { record, kind: item.kind, localFile: item.file, artifactPath: module.artifact.path || null }
})
server.version = '2026.10.18.5'
inventory.modCount = inventory.mods.length
assert.equal(inventory.modCount, 44)
assert.deepEqual(before.servers.filter(item => item.id !== 'tokemon'), candidate.servers.filter(item => item.id !== 'tokemon'))
const old = before.servers.find(item => item.id === 'tokemon')
assert.deepEqual({ ...old, modules: [], version: '' }, { ...server, modules: [], version: '' })
assert.deepEqual(old.modules, server.modules.slice(0, -4))
assert.deepEqual(inventoryBefore.mods, inventory.mods.slice(0, -2))
write(root + '/distribution.json', candidate)
write(root + '/docs/packs/tokemon-files.json', inventory)
write(root + '/docs/packs/tokemon-client-utilities.json', {
    packVersion: server.version, minecraft: inventory.minecraft, loader: inventory.loader,
    additions: changes.map(item => ({ ...item.record, kind: item.kind, artifactPath: item.artifactPath })),
    resourcePackActivation: 'Installed into resourcepacks; enable AZOTH and Sodium Translations in Options > Resource Packs. Existing options are preserved.',
    iconDisplay: 'JourneyMap > Options > Minimap Preset / Full Map Preset > Mob Display > Outlined Icons',
    upstreamNotes: { azoth: 'Upstream version 1.8.2 uses the filename AZOTH_JourneyMap_Icons-1.8.3.zip. Original bytes preserved. Java ZipFile and ImageIO read all 2883 PNGs; ZIP uses nonstandard CRC/header fields.', sodium: 'Existing Sodium 0.8.13 is preserved; this adds only its translation resource pack.' }
})
fs.writeFileSync(root + '/docs/packs/tokemon-2026.10.18.5.txt', [
    '토켓몬 팩 2026.10.18.5', '',
    '추가: Korean Chat Patch 1.9.6 / JourneyMap 6.0.9',
    '리소스팩: AZOTH JourneyMap Icons (Cobblemon 1.8.2), Sodium Translations v8.20.0',
    '기존 Sodium 0.8.13과 나머지 모드·서버 주소·Java·메모리·키 설정은 유지합니다.', '',
    '게임을 종료하고 KTZ 런처에서 토켓몬 PLAY를 누르면 다운로드됩니다. 런처 재설치는 필요 없습니다.',
    '옵션 > 리소스 팩에서 AZOTH와 Sodium Translations를 활성화하세요. 기존 사용자 설정은 자동으로 덮어쓰지 않습니다.',
    'JourneyMap: 기본 J로 지도 열기 > 옵션 > 미니맵/전체지도 프리셋 > 몹 표시를 Outlined Icons(윤곽선 아이콘)로 선택하세요.',
    'J가 다른 기능과 겹치면 조작 설정에서 JourneyMap 전체지도 키를 변경하세요.',
    '한글 입력: Windows 한/영 키. IME 전환: 기본 왼쪽 Ctrl+I. 기존 키 바인딩을 강제로 바꾸지 않습니다.', '',
    '클라이언트 편의 기능 추가이며 서버 재시작은 필요 없습니다.',
    '다운로드·체크섬·실행 목록 검증과 실제 게임 내 한글 입력·지도 화면 검증은 구분합니다.',
    '뼈 블록 제한 업데이트는 별도 적용 대기 상태를 유지합니다.', ''
].join('\n'))
write(work + '/staging.json', { createdAt: new Date().toISOString(), version: server.version, oldVersion: old.version, modCount: inventory.modCount, root, backup, instance, protectedFiles, changes, otherServersPreserved: true, otherModsPreserved: true, settingsAndJavaUnchanged: true, resourcePacksRequireActivation: true, serverRestartRequired: false })
console.log(JSON.stringify({ version: server.version, addedMods: 2, addedResourcePacks: 2, modCount: inventory.modCount, work }))
