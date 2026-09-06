const assert = require('assert')
const fs = require('fs-extra')
const Module = require('module')
const os = require('os')
const path = require('path')
const vm = require('vm')

const sourcePath = path.join(__dirname, '..', 'app', 'assets', 'js', 'astervalepackmanager.js')
const projectRequire = Module.createRequire(sourcePath)
const preferredTempRoot = process.platform === 'win32' && fs.existsSync('E:\\Codex\\Temp')
    ? 'E:\\Codex\\Temp'
    : os.tmpdir()
const testRoot = fs.mkdtempSync(path.join(preferredTempRoot, 'ktz-astervale-live-patch-'))
const commonDir = path.join(testRoot, 'common')
const instanceDir = path.join(testRoot, 'instances')
const gameDir = path.join(instanceDir, 'astervale')

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
    applyManagedClientPreferences,
    installStagedPayload,
    isUserPreservedPath,
    readInstalledState,
    writeInstalledState
}
`
vm.runInNewContext(source, sandbox, { filename: sourcePath })

const api = sandbox.module.exports.__test

async function main(){
    const manifest = api.normalizeManifest({
        schemaVersion: 1,
        packId: 'astervale',
        version: '1.0.0',
        fileName: 'astervale-client-pack-1.0.0.zip',
        url: 'https://example.com/astervale-client-pack-1.0.0.zip',
        shaderPacks: [
            { file: '에스텔서버 쉐이더.zip', optionsFile: '에스텔서버 쉐이더.zip.txt', enabled: true }
        ],
        livePatch: {
            revision: 1,
            remove: [
                'resourcepacks/Old Visuals.zip',
                'mods/old-client-mod.jar',
                'emotes/Old Dance.emotecraft'
            ],
            files: []
        }
    })

    for(const file of [
        'mods/example.jar',
        'mods/old-client-mod.jar',
        'config/example.json',
        'emotes/Old Dance.emotecraft',
        'shaderpacks/에스텔서버 쉐이더.zip',
        'shaderpacks/에스텔서버 쉐이더.zip.txt',
        'resourcepacks/Old Visuals.zip',
        'resourcepacks/Keep.zip'
    ]){
        fs.outputFileSync(path.join(gameDir, ...file.split('/')), file)
    }

    api.writeInstalledState(manifest)
    assert.strictEqual(await api.applyLivePatch(manifest), true)
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Old Visuals.zip')), false)
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'mods', 'old-client-mod.jar')), false)
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'emotes', 'Old Dance.emotecraft')), false)
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Keep.zip')), true)
    assert.strictEqual(api.readInstalledState().livePatchRevision, 1)
    assert.strictEqual(await api.applyLivePatch(manifest), false)

    const payloadDir = path.join(testRoot, 'payload-validation')
    for(const file of [
        'mods/example.jar',
        'config/example.json',
        'resourcepacks/example.zip'
    ]){
        fs.outputFileSync(path.join(payloadDir, ...file.split('/')), file)
    }
    assert.strictEqual(sandbox.module.exports.hasValidPayload(payloadDir, manifest), false)
    fs.outputFileSync(path.join(payloadDir, 'emotes', 'Example.emotecraft'), 'emote')
    assert.strictEqual(sandbox.module.exports.hasValidPayload(payloadDir, manifest), false)
    fs.outputFileSync(path.join(payloadDir, 'shaderpacks', 'Example.zip'), 'shader')
    assert.strictEqual(sandbox.module.exports.hasValidPayload(payloadDir, manifest), true)

    fs.outputFileSync(path.join(gameDir, 'options.txt'), 'fov:0.5\nmenuBackgroundBlurriness:7\n')
    fs.outputFileSync(path.join(gameDir, 'config', 'iris.properties'), '# Iris\nenableShaders=false\nshaderPack=Other.zip\n')
    api.applyManagedClientPreferences(manifest)
    const gameOptions = fs.readFileSync(path.join(gameDir, 'options.txt'), 'utf8')
    const irisOptions = fs.readFileSync(path.join(gameDir, 'config', 'iris.properties'), 'utf8')
    assert.match(gameOptions, /^menuBackgroundBlurriness:0$/m)
    assert.match(gameOptions, /^fov:0\.5$/m)
    assert.match(irisOptions, /^enableShaders=true$/m)
    assert.match(irisOptions, /^shaderPack=\\uC5D0\\uC2A4\\uD154\\uC11C\\uBC84 \\uC250\\uC774\\uB354\.zip$/m)

    const rollbackManifest = api.normalizeManifest({
        packId: 'astervale',
        version: '1.0.0',
        fileName: 'pack.zip',
        url: 'https://example.com/pack.zip',
        livePatch: { revision: 2, remove: ['resourcepacks/Keep.zip'], files: [] }
    })
    fs.removeSync(path.join(gameDir, '.ktz-pack-state.json'))
    await assert.rejects(() => api.applyLivePatch(rollbackManifest), /unknown pack state/)
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'resourcepacks', 'Keep.zip')), true)

    assert.throws(() => api.normalizeManifest({
        packId: 'astervale',
        version: '1.0.0',
        fileName: 'pack.zip',
        url: 'https://example.com/pack.zip',
        livePatch: { revision: 2, remove: ['resourcepacks/../../outside.zip'] }
    }), /managed folder/)

    assert.throws(() => api.normalizeManifest({
        packId: 'astervale',
        version: '1.0.0',
        fileName: 'pack.zip',
        url: 'https://example.com/pack.zip',
        livePatch: { revision: 3, remove: ['config/voicechat/voicechat-client.properties'] }
    }), /player-owned settings/)

    const stagingRoot = path.join(testRoot, 'preservation-staging')
    fs.removeSync(gameDir)
    for(const file of [
        'mods/old.jar',
        'config/old-managed.json',
        'resourcepacks/old.zip',
        'emotes/old.emotecraft',
        'shaderpacks/old.zip'
    ]){
        fs.outputFileSync(path.join(gameDir, ...file.split('/')), 'old')
    }
    fs.outputFileSync(path.join(gameDir, 'config', 'voicechat', 'voicechat-client.properties'), 'microphone_amplification=2.0\nhide_icons=true\n')
    fs.outputFileSync(path.join(gameDir, 'config', 'voicechat', 'player-volumes.properties'), 'player-id=0.25\n')
    fs.outputFileSync(path.join(gameDir, 'config', 'pastelpocket-client.properties'), 'hideArmorAppearance=true\n')

    for(const file of [
        'mods/new.jar',
        'config/new-managed.json',
        'config/voicechat/voicechat-client.properties',
        'config/pastelpocket-client.properties',
        'resourcepacks/new.zip',
        'emotes/new.emotecraft',
        'shaderpacks/new.zip'
    ]){
        fs.outputFileSync(path.join(stagingRoot, ...file.split('/')), 'pack-default')
    }

    const preservationManifest = api.normalizeManifest({
        packId: 'astervale',
        version: '1.1.0',
        fileName: 'pack.zip',
        url: 'https://example.com/pack.zip'
    })
    api.installStagedPayload(stagingRoot, preservationManifest)
    assert.strictEqual(
        fs.readFileSync(path.join(gameDir, 'config', 'voicechat', 'voicechat-client.properties'), 'utf8'),
        'microphone_amplification=2.0\nhide_icons=true\n'
    )
    assert.strictEqual(
        fs.readFileSync(path.join(gameDir, 'config', 'voicechat', 'player-volumes.properties'), 'utf8'),
        'player-id=0.25\n'
    )
    assert.strictEqual(
        fs.readFileSync(path.join(gameDir, 'config', 'pastelpocket-client.properties'), 'utf8'),
        'hideArmorAppearance=true\n'
    )
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'config', 'old-managed.json')), false)
    assert.strictEqual(fs.existsSync(path.join(gameDir, 'config', 'new-managed.json')), true)

    console.log('Aster Vale live patch tests passed.')
}

main().finally(() => fs.removeSync(testRoot)).catch(err => {
    console.error(err)
    process.exitCode = 1
})

