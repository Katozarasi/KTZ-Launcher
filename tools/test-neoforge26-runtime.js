const assert = require('assert/strict')
const fs = require('fs-extra')
const path = require('path')
const vm = require('vm')
const { getMojangOS } = require('helios-core/common')

const root = fs.mkdtempSync('C:\\codex\\Temp\\ktz-neoforge26-regression-')
const source = path.join(__dirname, '../app/assets/js/neoforgeprocessbuilder.js')
const logger = { info() {}, warn() {}, error() {} }
const context = {
    module: { exports: {} },
    exports: {},
    process,
    console,
    require: id => {
        if(id === './processbuilder') return class ProcessBuilder { _processClassPathList() {} }
        if(id === './configmanager') return {}
        if(id === 'helios-core') return { LoggerUtil: { getLogger: () => logger } }
        return require(id)
    }
}
vm.runInNewContext(fs.readFileSync(source, 'utf8'), context, { filename: source })
const Builder = context.module.exports
const builder = Object.create(Builder.prototype)
builder.commonDir = path.join(root, 'common')
builder.libPath = path.join(builder.commonDir, 'libraries')
builder.server = { rawServer: { ktz: { loaderVersion: '26.3.0.101' } } }
builder.vanillaManifest = { id: '26.3', libraries: [] }
builder.neoForgeCommonDir = builder._officialMinecraftDir()
builder.neoForgeLibPath = path.join(builder.neoForgeCommonDir, 'libraries')
builder.neoForgeRuntimeId = 'neoforge-26.3.0.101'
const version = builder._neoForgeVersion()
const runtime = builder.neoForgeCommonDir
const manifestPath = path.join(runtime, 'versions', builder.neoForgeRuntimeId, builder.neoForgeRuntimeId + '.json')
const patched = path.join(builder.neoForgeLibPath, 'net/neoforged/minecraft-client-patched', version, `minecraft-client-patched-${version}.jar`)
const universal = path.join(builder.neoForgeLibPath, 'net/neoforged/neoforge', version, `neoforge-${version}-universal.jar`)
const vanilla = path.join(builder.commonDir, 'versions/26.3/26.3.jar')
const loaderRelative = 'net/neoforged/fancymodloader/loader/12.0.12/loader-12.0.12.jar'
const loader = path.join(builder.neoForgeLibPath, loaderRelative)
const validManifest = {
    id: builder.neoForgeRuntimeId,
    inheritsFrom: '26.3',
    mainClass: 'net.neoforged.fml.startup.Client',
    arguments: { game: [], jvm: [] },
    libraries: [{ name: 'net.neoforged.fancymodloader:loader:12.0.12', downloads: { artifact: { path: loaderRelative } } }]
}
function write(file) {
    fs.ensureDirSync(path.dirname(file))
    fs.writeFileSync(file, 'verification fixture')
    return file
}
function saveManifest(value) { fs.outputJsonSync(manifestPath, value) }
function lib(name, relative, osName) {
    return { name, downloads: { artifact: { path: relative } }, ...(osName ? { rules: [{ action: 'allow', os: { name: osName } }] } : {}) }
}
function cleanup() {
    const allowed = path.resolve('C:/codex/Temp') + path.sep
    assert(path.resolve(root).toLowerCase().startsWith(allowed.toLowerCase()), 'Unsafe verification cleanup path')
    fs.removeSync(root)
}
try {
    assert.equal(runtime, path.join(builder.commonDir, 'neoforge', version))
    assert.equal(builder._findOfficialRuntime(runtime), null)
    for(const file of [patched, universal, loader, vanilla]) write(file)
    saveManifest(validManifest)
    assert.equal(builder._findOfficialRuntime(runtime).clientSrgJar, patched)
    assert.equal(builder._findOfficialRuntime(runtime).universalJar, universal)
    for(const file of [patched, universal, loader]) {
        fs.unlinkSync(file)
        assert.equal(builder._findOfficialRuntime(runtime), null, 'Incomplete runtime must be repaired: ' + file)
        write(file)
    }
    saveManifest({ ...validManifest, inheritsFrom: '1.21.4' })
    assert.equal(builder._findOfficialRuntime(runtime), null)
    saveManifest(validManifest)

    const osName = getMojangOS()
    const otherOS = osName === 'windows' ? 'linux' : 'windows'
    const matching = lib('org.lwjgl:lwjgl:3.4.3:natives-' + osName, 'lwjgl/current-platform.jar', osName)
    const foreign = lib('org.lwjgl:lwjgl:3.4.3:natives-' + otherOS, 'lwjgl/foreign-platform.jar', otherOS)
    const java = lib('com.example:library:1', 'example/library.jar')
    const asm = lib('org.ow2.asm:asm:9.8', 'asm/vanilla-asm.jar')
    for(const library of [matching, foreign, java, asm]) write(path.join(builder.libPath, library.downloads.artifact.path))
    builder.vanillaManifest.libraries = [matching, foreign, java, asm]
    builder.modManifest = validManifest
    const classpath = builder._orderedNeoForgeLibraries()
    assert(classpath.includes(vanilla), 'Production Minecraft bootstrap JAR missing')
    assert(!classpath.includes(patched), 'Patched Minecraft JAR incorrectly enables FML development mode')
    assert(!classpath.includes(universal), 'NeoForge universal JAR incorrectly included in bootstrap classpath')
    assert(classpath.includes(loader), 'FML loader missing')
    assert(classpath.includes(path.join(builder.libPath, matching.downloads.artifact.path)), 'Current OS native JAR missing')
    assert(!classpath.includes(path.join(builder.libPath, foreign.downloads.artifact.path)), 'Foreign OS native JAR included')
    assert(!classpath.includes(path.join(builder.libPath, asm.downloads.artifact.path)), 'Vanilla ASM shadows NeoForge ASM')
    assert.equal(classpath.length, new Set(classpath).size)
    assert.equal(builder._neoForgeVersionJar(), vanilla)
    console.log('PASS: isolated runtime requires patched/universal/loader JARs; production bootstrap uses vanilla JAR and OS natives without duplicate ASM')

    const libraryArgument = '-DlibraryDirectory=' + builder.libPath
    const remapped = '-DlibraryDirectory=' + builder.neoForgeLibPath
    assert.equal(builder._remapNeoForgeRuntimePath(libraryArgument), remapped)
    assert.equal(builder._remapNeoForgeRuntimePath(remapped), remapped, 'Nested runtime path on a second pass')
    const assets = path.join(builder.commonDir, 'assets')
    assert.equal(builder._remapNeoForgeJvmArgument(assets, '--assetsDir'), assets)
    const joined = classpath.join(path.delimiter)
    assert.equal(builder._remapNeoForgeJvmArgument(joined, '-cp'), joined)
    builder.server.rawServer.ktz.loaderVersion = '../../escape'
    assert.throws(() => builder._neoForgeVersion(), /Invalid NeoForge version/)
    builder.server.rawServer.ktz.loaderVersion = version
    console.log('PASS: library remap is idempotent; assets/classpath stay intact; invalid loader version rejected')

    fs.writeFileSync(manifestPath, '{"inheritsFrom":')
    assert.equal(builder._findOfficialRuntime(runtime), null, 'Truncated manifest must trigger repair')
    saveManifest({ ...validManifest, mainClass: undefined })
    assert.equal(builder._findOfficialRuntime(runtime), null, 'Missing entrypoint must trigger repair')
    saveManifest({ ...validManifest, libraries: [] })
    assert.equal(builder._findOfficialRuntime(runtime), null, 'Missing loader libraries must trigger repair')
    saveManifest(validManifest)
    assert(builder._findOfficialRuntime(runtime))
    console.log('PASS: malformed or incomplete runtime manifest triggers repair')
} finally {
    cleanup()
}
