const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('helios-core')
const { Type } = require('helios-distribution-types')

const ProcessBuilder = require('./processbuilder')
const ConfigManager = require('./configmanager')

const logger = LoggerUtil.getLogger('NeoForgeProcessBuilder')

class NeoForgeProcessBuilder extends ProcessBuilder {

    constructor(distroServer, vanillaManifest, modManifest, authUser, launcherVersion) {
        super(distroServer, vanillaManifest, modManifest, authUser, launcherVersion)
        this.usingNeoForgeLoader = true
    }

    build() {
        logger.info('Using dedicated NeoForge process builder.')
        return super.build()
    }

    _neoForgeVersion() {
        const rawVersion = this.server.rawServer.ktz?.loaderVersion || '21.4.157'
        return String(rawVersion).replace('neoforge-', '')
    }

    _neoForgeId() {
        return 'neoforge-' + this._neoForgeVersion()
    }

    _neoForgeVersionJar() {
        const id = this._neoForgeId()
        const version = this._neoForgeVersion()
        const source = path.join(this.commonDir, 'libraries', 'net', 'neoforged', 'neoforge', version, id + '.jar')
        const targetDir = path.join(this.gameDir, 'versions', id)
        const target = path.join(targetDir, id + '.jar')

        if(fs.existsSync(source)) {
            fs.ensureDirSync(targetDir)
            if(!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
                fs.copySync(source, target)
                logger.info('Copied generated NeoForge version jar to official-style path:', target)
            }
        }

        return fs.existsSync(target) ? target : source
    }

    _libraryPathFromManifest(lib) {
        const artifact = lib.downloads?.artifact
        if(!artifact?.path) {
            return null
        }
        return path.join(this.libPath, artifact.path)
    }

    _excludedVanillaLibrary(lib) {
        const name = lib.name || ''

        // NeoForge's JVM module path already contains ASM 9.8.
        // Minecraft 1.21.4's vanilla manifest can still contribute ASM 9.6,
        // which causes: Module org.objectweb.asm already on module path.
        if(name.startsWith('org.ow2.asm:')) {
            return true
        }

        return false
    }

    _orderedNeoForgeLibraries() {
        const libs = []
        const seen = new Set()

        const add = filePath => {
            if(filePath == null || !fs.existsSync(filePath) || seen.has(filePath)) {
                return
            }
            seen.add(filePath)
            libs.push(filePath)
        }

        // Official NeoForge profiles place NeoForge/FML libraries first.
        for(const lib of this.modManifest.libraries || []) {
            add(this._libraryPathFromManifest(lib))
        }

        // Then Mojang-declared libraries in Mojang manifest order.
        // Exclude libraries whose Java modules are already supplied by NeoForge's module path.
        for(const lib of this.vanillaManifest.libraries || []) {
            if(this._excludedVanillaLibrary(lib)) {
                logger.info('Skipping vanilla library already supplied by NeoForge module path:', lib.name)
                continue
            }

            if(lib.downloads?.artifact?.path != null && !lib.name.includes('natives-')) {
                add(path.join(this.libPath, lib.downloads.artifact.path))
            }
        }

        // The generated NeoForge version jar must be last, like the official launcher command.
        add(this._neoForgeVersionJar())

        this._processClassPathList(libs)
        logger.info('NeoForge classpath entries:', libs.length)
        return libs
    }

    classpathArg(_mods, tempNativePath) {
        // Reuse native extraction from the base builder, but build the classpath in official NeoForge order.
        this._resolveMojangLibraries(tempNativePath)
        return this._orderedNeoForgeLibraries()
    }

    constructModList(mods) {
        const modsDir = path.join(this.gameDir, 'mods')
        fs.ensureDirSync(modsDir)

        for(const entry of fs.readdirSync(modsDir)) {
            if(entry.toLowerCase().endsWith('.jar')) {
                fs.removeSync(path.join(modsDir, entry))
            }
        }

        for(const mod of mods) {
            const source = mod.getPath()
            const target = path.join(modsDir, path.basename(source))
            fs.copySync(source, target)
            logger.info('Copied NeoForge mod to instance mods folder:', target)
        }

        logger.info('Using standard NeoForge mods folder discovery instead of --fml.modLists.')
        return []
    }

    resolveModConfiguration(modCfg, mdls) {
        let fMods = []
        let lMods = []

        for(const mdl of mdls) {
            const type = mdl.rawModule.type
            if(type === Type.ForgeMod || type === Type.FabricMod || type === Type.LiteMod || type === Type.LiteLoader) {
                const optional = !mdl.getRequired().value
                const enabled = ProcessBuilder.isModEnabled(modCfg[mdl.getVersionlessMavenIdentifier()], mdl.getRequired())
                if(!optional || enabled) {
                    if(mdl.subModules.length > 0) {
                        const subCfg = modCfg[mdl.getVersionlessMavenIdentifier()]?.mods || {}
                        const resolved = this.resolveModConfiguration(subCfg, mdl.subModules)
                        fMods = fMods.concat(resolved.fMods)
                        lMods = lMods.concat(resolved.lMods)
                    }
                    if(type === Type.ForgeMod || type === Type.FabricMod) {
                        fMods.push(mdl)
                    } else {
                        lMods.push(mdl)
                    }
                }
            }
        }

        return { fMods, lMods }
    }

    _constructJVMArguments113(mods, tempNativePath) {
        const args = super._constructJVMArguments113(mods, tempNativePath)
        const id = this._neoForgeId()

        const versionIndex = args.indexOf('--version')
        if(versionIndex > -1 && args[versionIndex + 1] != null) {
            args[versionIndex + 1] = id
        }

        const launcherNameIndex = args.indexOf('-Dminecraft.launcher.brand=MRS-Launcher')
        if(launcherNameIndex > -1) {
            args[launcherNameIndex] = '-Dminecraft.launcher.brand=KTZ-Launcher'
        }

        logger.info('NeoForge --version:', id)
        return args
    }
}

module.exports = NeoForgeProcessBuilder
