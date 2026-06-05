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

    _vanillaClientJar() {
        const version = this.vanillaManifest.id
        return path.join(this.commonDir, 'versions', version, version + '.jar')
    }

    _neoForgeVersionJar() {
        const id = this._neoForgeId()
        const version = this._neoForgeVersion()
        const sourceJar = path.join(this.commonDir, 'libraries', 'net', 'neoforged', 'neoforge', version, id + '.jar')
        const sourceJson = path.join(this.commonDir, 'versions', id, id + '.json')
        const targetDir = path.join(this.gameDir, 'versions', id)
        const targetJar = path.join(targetDir, id + '.jar')
        const targetJson = path.join(targetDir, id + '.json')

        fs.ensureDirSync(targetDir)

        if(fs.existsSync(sourceJar)) {
            if(!fs.existsSync(targetJar) || fs.statSync(targetJar).size !== fs.statSync(sourceJar).size) {
                fs.copySync(sourceJar, targetJar)
                logger.info('Copied generated NeoForge version jar to instance versions path:', targetJar)
            }
        } else {
            logger.warn('NeoForge generated version jar source missing:', sourceJar)
        }

        if(fs.existsSync(sourceJson)) {
            if(!fs.existsSync(targetJson) || fs.statSync(targetJson).size !== fs.statSync(sourceJson).size) {
                fs.copySync(sourceJson, targetJson)
                logger.info('Copied NeoForge version json to instance versions path:', targetJson)
            }
        } else if(this.modManifest != null) {
            fs.writeFileSync(targetJson, JSON.stringify(this.modManifest, null, 2), 'utf8')
            logger.info('Wrote NeoForge version json from loaded manifest:', targetJson)
        }

        return fs.existsSync(targetJar) ? targetJar : sourceJar
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

        if(name.startsWith('org.ow2.asm:')) {
            return true
        }

        return false
    }

    _orderedNeoForgeLibraries() {
        const libs = []
        const seen = new Set()

        const add = (filePath, label = null) => {
            if(filePath == null || !fs.existsSync(filePath) || seen.has(filePath)) {
                return
            }
            seen.add(filePath)
            libs.push(filePath)
            if(label != null) {
                logger.info('Added ' + label + ' to NeoForge classpath:', filePath)
            }
        }

        for(const lib of this.modManifest.libraries || []) {
            add(this._libraryPathFromManifest(lib))
        }

        for(const lib of this.vanillaManifest.libraries || []) {
            if(this._excludedVanillaLibrary(lib)) {
                logger.info('Skipping vanilla library already supplied by NeoForge module path:', lib.name)
                continue
            }

            if(lib.downloads?.artifact?.path != null && !lib.name.includes('natives-')) {
                add(path.join(this.libPath, lib.downloads.artifact.path))
            }
        }

        add(this._vanillaClientJar(), 'vanilla client jar fallback')
        add(this._neoForgeVersionJar(), 'generated NeoForge version jar')

        this._processClassPathList(libs)
        logger.info('NeoForge classpath entries:', libs.length)
        return libs
    }

    classpathArg(_mods, tempNativePath) {
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
