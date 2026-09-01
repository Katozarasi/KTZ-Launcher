const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const vm = require('vm')

const sourcePath = path.join(__dirname, '..', 'app', 'assets', 'js', 'neoforgeprocessbuilder.js')
const preferredTempRoot = process.platform === 'win32' && fs.existsSync('E:\\Codex\\Temp')
    ? 'E:\\Codex\\Temp'
    : os.tmpdir()
const testRoot = fs.mkdtempSync(path.join(preferredTempRoot, 'ktz-neoforge-managed-pack-'))

const fsExtra = {
    ...fs,
    ensureDirSync: directory => fs.mkdirSync(directory, { recursive: true }),
    removeSync: target => fs.rmSync(target, { recursive: true, force: true }),
    copySync: (source, target) => {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(source, target)
    }
}

const logger = {
    info: () => {},
    warn: () => {},
    error: () => {}
}

const sandbox = {
    console,
    module: { exports: {} },
    exports: {},
    process,
    require: id => {
        if(id === 'child_process') return {}
        if(id === 'fs-extra') return fsExtra
        if(id === 'path') return path
        if(id === 'helios-core') return { LoggerUtil: { getLogger: () => logger } }
        if(id === 'helios-distribution-types') return { Type: {} }
        if(id === './processbuilder') return class ProcessBuilder {}
        if(id === './configmanager') return {}
        throw new Error('Unexpected test dependency: ' + id)
    },
    __dirname: path.dirname(sourcePath),
    __filename: sourcePath
}

vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath })
const NeoForgeProcessBuilder = sandbox.module.exports

function runConstructModList(gameDir, server, sources){
    const builder = Object.create(NeoForgeProcessBuilder.prototype)
    builder.gameDir = gameDir
    builder.server = server
    builder.constructModList(sources.map(source => ({ getPath: () => source })))
}

try {
    const managedGameDir = path.join(testRoot, 'managed')
    const managedModsDir = path.join(managedGameDir, 'mods')
    const sourceDir = path.join(testRoot, 'sources')
    const distributionMod = path.join(sourceDir, 'distribution.jar')

    fs.mkdirSync(managedModsDir, { recursive: true })
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(path.join(managedModsDir, 'managed-pack.jar'), 'managed')
    fs.writeFileSync(distributionMod, 'distribution')

    runConstructModList(managedGameDir, {
        rawServer: { ktz: { packManifest: 'https://example.com/pack.json' } }
    }, [distributionMod])

    assert.strictEqual(fs.existsSync(path.join(managedModsDir, 'managed-pack.jar')), true)
    assert.strictEqual(fs.existsSync(path.join(managedModsDir, 'distribution.jar')), true)

    const unmanagedGameDir = path.join(testRoot, 'unmanaged')
    const unmanagedModsDir = path.join(unmanagedGameDir, 'mods')
    fs.mkdirSync(unmanagedModsDir, { recursive: true })
    fs.writeFileSync(path.join(unmanagedModsDir, 'stale.jar'), 'stale')

    runConstructModList(unmanagedGameDir, { rawServer: {} }, [distributionMod])

    assert.strictEqual(fs.existsSync(path.join(unmanagedModsDir, 'stale.jar')), false)
    assert.strictEqual(fs.existsSync(path.join(unmanagedModsDir, 'distribution.jar')), true)

    console.log('Managed NeoForge pack preservation tests passed.')
} finally {
    fs.rmSync(testRoot, { recursive: true, force: true })
}
