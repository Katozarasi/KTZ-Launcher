const assert = require('assert')
const fs = require('fs-extra')
const Module = require('module')
const os = require('os')
const path = require('path')
const vm = require('vm')

const sourcePath = path.join(__dirname, '..', 'app', 'assets', 'js', 'toketmonpackmanager.js')
const projectRequire = Module.createRequire(sourcePath)
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ktz-live-patch-'))
const commonDir = path.join(testRoot, 'common')
const instanceDir = path.join(testRoot, 'instances')
const gameDir = path.join(instanceDir, 'toketmon')

const configManager = {
    getCommonDirectory: () => commonDir,
    getInstanceDirectory: () => instanceDir
}

const sandbox = {
    console,
    globalThis: {},
    module: { exports: {} },
    exports: {},
    require: id => id === './configmanager' ? configManager : projectRequire(id),
    __dirname: path.dirname(sourcePath),
    __filename: sourcePath
}

const source = fs.readFileSync(sourcePath, 'utf8') + `
module.exports.__test = {
    normalizeManifest,
    applyLivePatch,
    migrateLegacyInstall,
    readInstalledState,
    writeInstalledState
}
`
vm.runInNewContext(source, sandbox, { filename: sourcePath })

const api = sandbox.module.exports.__test
const manifest = api.normalizeManifest({
    schemaVersion: 1,
    packId: 'toketmon',
    version: '2.0.0',
    fileName: 'toketmon-client-pack-2.0.0.zip',
    url: 'https://example.com/toketmon-client-pack-2.0.0.zip',
    livePatch: {
        revision: 1,
        remove: [
            'resourcepacks/Fresh Animations.zip',
            'resourcepacks/Fresh Moves.zip'
        ],
        files: []
    }
})

for(const file of [
    'mods/example.jar',
    'config/example.json',
    'datapacks/example.zip',
    'resourcepacks/Fresh Animations.zip',
    'resourcepacks/Fresh Moves.zip',
    'resourcepacks/Keep.zip'
]){
    fs.outputFileSync(path.join(gameDir, ...file.split('/')), file)
}

api.writeInstalledState(manifest)
assert.strictEqual(api.applyLivePatch(manifest), true)
assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Fresh Animations.zip')), false)
assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Fresh Moves.zip')), false)
assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Keep.zip')), true)
assert.strictEqual(api.readInstalledState().livePatchRevision, 1)
assert.strictEqual(api.applyLivePatch(manifest), false)

const rollbackManifest = api.normalizeManifest({
    packId: 'toketmon',
    version: '2.0.0',
    fileName: 'pack.zip',
    url: 'https://example.com/pack.zip',
    livePatch: { revision: 2, remove: ['resourcepacks/Keep.zip'], files: [] }
})
fs.removeSync(path.join(gameDir, '.ktz-pack-state.json'))
assert.throws(() => api.applyLivePatch(rollbackManifest), /unknown pack state/)
assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Keep.zip')), true)

assert.throws(() => api.normalizeManifest({
    packId: 'toketmon',
    version: '2.0.0',
    fileName: 'pack.zip',
    url: 'https://example.com/pack.zip',
    livePatch: { revision: 2, remove: ['resourcepacks/../../outside.zip'] }
}), /managed folder/)

fs.outputFileSync(path.join(gameDir, '.ktz-toketmon-client-pack-v1'), '')
api.writeInstalledState(manifest)
const migrated = api.migrateLegacyInstall()
assert.strictEqual(migrated.installedVersion, '1.0.0')
assert.strictEqual(api.readInstalledState().installedVersion, '1.0.0')

fs.removeSync(testRoot)
console.log('Toketmon live patch tests passed.')
