const assert = require('assert/strict')
const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const AdmZip = require('adm-zip')

const project = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync('C:\\codex\\Temp\\ktz-pack-target-')
const base = 'C:/codex/Builds/esterveil-26.3-20261105/pack-builder-tests'
fs.ensureDirSync(base)
const buildRoot = fs.mkdtempSync(path.join(base, 'run-'))
const profile = path.join(scratch, 'synthetic-profile')
const published = ['docs/packs/astervale.json', 'docs/packs/astervale-files.json', 'distribution.json']
const before = new Map(published.map(file => [file, fs.readFileSync(path.join(project, file))]))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function write(relative, contents) { fs.outputFileSync(path.join(profile, relative), contents) }
function zip(relative, entries) {
    const archive = new AdmZip()
    for(const [name, contents] of Object.entries(entries)) archive.addFile(name, Buffer.from(contents))
    write(relative, archive.toBuffer())
}
function unchanged() {
    for(const [file, bytes] of before) assert(fs.readFileSync(path.join(project, file)).equals(bytes), 'Published file changed: ' + file)
}
zip('mods/target-fixture.jar', { 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n', 'verification-only.txt': 'Synthetic packaging fixture; not a playable mod.' })
write('emotes/folder/fixture.emotecraft', 'Synthetic archive-preservation fixture, not a playable emote.\n')
zip('shaderpacks/fixture-shader.zip', { 'shaders/shaders.properties': 'profile.TEST=TEST\n' })
zip('resourcepacks/fixture-resources.zip', { 'pack.mcmeta': '{"pack":{"description":"Test fixture","pack_format":97}}' })
write('shaderpacks/fixture-shader.zip.txt', 'TEST=true\n')
write('config/iris.properties', 'shaderPack=fixture-shader.zip\n')
write('config/dynamic_fps.json', '{"unfocused_fps":15}\n')
write('options.txt', 'resourcePacks:["vanilla","file/fixture-resources.zip"]\nincompatibleResourcePacks:["file/fixture-resources.zip"]\n')

const results = []
for(const target of [
    { minecraft: '26.3', loader: '26.3.0.101', version: '26.3-verification-only' },
    { minecraft: '1.21.4', loader: '21.4.157', version: '1.21.4-verification-only' }
]) {
    const manifestPath = path.join(scratch, target.version + '-manifest.json')
    const inventoryPath = path.join(scratch, target.version + '-inventory.json')
    fs.outputJsonSync(manifestPath, {
        schemaVersion: 1, packId: 'astervale', version: 'before-test', minecraftVersion: target.minecraft,
        loader: { type: 'neoforge', version: target.loader }, minimumLauncherVersion: '3.4.5-preview.1'
    })
    fs.outputJsonSync(inventoryPath, { schemaVersion: 1, packId: 'astervale', files: [] })
    const result = spawnSync(process.execPath, [
        path.join(__dirname, 'build-astervale-pack.js'), '--manifest-path', manifestPath,
        '--inventory-path', inventoryPath, '--profile', profile, '--version', target.version,
        '--output-root', buildRoot
    ], { cwd: project, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, TEMP: scratch, TMP: scratch } })
    fs.writeFileSync(path.join(buildRoot, target.version + '.log'), result.stdout + result.stderr)
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    const manifest = fs.readJsonSync(manifestPath)
    const inventory = fs.readJsonSync(inventoryPath)
    assert.equal(manifest.minecraftVersion, target.minecraft)
    assert.deepEqual(manifest.loader, { type: 'neoforge', version: target.loader })
    assert.equal(inventory.minecraftVersion, target.minecraft)
    assert.equal(inventory.loader, 'neoforge-' + target.loader)
    assert.equal(manifest.version, target.version)
    assert.equal(inventory.version, target.version)
    assert.equal(manifest.minimumLauncherVersion, '3.4.5-preview.1')
    const zipPath = path.join(buildRoot, target.version, manifest.fileName)
    const bytes = fs.readFileSync(zipPath)
    assert.equal(manifest.size, bytes.length)
    assert.equal(manifest.sha256, sha256(bytes))
    const archive = new AdmZip(bytes)
    for(const file of inventory.files) {
        const source = fs.readFileSync(path.join(profile, file.path))
        const packed = archive.readFile(file.path)
        assert(packed?.equals(source), 'Archive content differs: ' + file.path)
        assert.equal(file.size, packed.length)
        assert.equal(file.sha256, sha256(packed))
    }
    assert(inventory.files.some(file => file.path === 'mods/target-fixture.jar'))
    assert(inventory.files.some(file => file.path === 'emotes/folder/fixture.emotecraft'))
    assert.deepEqual(manifest.resourcePacks, [{ file: 'fixture-resources.zip', incompatible: true }])
    assert.deepEqual(manifest.shaderPacks, [{ file: 'fixture-shader.zip', optionsFile: 'fixture-shader.zip.txt', enabled: true }])
    unchanged()
    results.push({ ...target, zipPath, files: inventory.files.length, sha256: manifest.sha256 })
    console.log(`PASS: explicit ${target.minecraft} / NeoForge ${target.loader} target; archive hashes and contents verified; published files unchanged`)
}

const invalidManifest = path.join(scratch, 'invalid-target.json')
const invalidInventory = path.join(scratch, 'invalid-inventory.json')
fs.outputJsonSync(invalidManifest, { packId: 'astervale', version: 'invalid', minecraftVersion: '26.3' })
const invalidBefore = fs.readFileSync(invalidManifest)
const rejected = spawnSync(process.execPath, [
    path.join(__dirname, 'build-astervale-pack.js'), '--manifest-path', invalidManifest,
    '--inventory-path', invalidInventory, '--profile', profile, '--output-root', buildRoot
], { cwd: project, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, TEMP: scratch, TMP: scratch } })
assert.notEqual(rejected.status, 0)
assert.match(rejected.stderr, /declare minecraftVersion and the NeoForge loader version/)
assert(!fs.existsSync(path.join(buildRoot, 'invalid')), 'Invalid target created a build tree')
assert(!fs.existsSync(invalidInventory), 'Invalid target overwrote inventory')
assert(fs.readFileSync(invalidManifest).equals(invalidBefore))
unchanged()
console.log('PASS: incomplete target rejected before outputs; published manifest/inventory/distribution unchanged')
fs.outputJsonSync(path.join(buildRoot, 'PASS.json'), { passed: true, scratch, results, publishedFilesPreserved: published }, { spaces: 2 })
console.log('Evidence: ' + path.join(buildRoot, 'PASS.json'))
