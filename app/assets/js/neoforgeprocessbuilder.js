const child_process = require('child_process')
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
        this.neoForgeCommonDir = this.commonDir
        this.neoForgeLibPath = this.libPath
        this.neoForgeRuntimeId = this._defaultNeoForgeId()

        const officialMinecraftDir = this._officialMinecraftDir()
        if(officialMinecraftDir != null) {
            let runtime = this._findOfficialRuntime(officialMinecraftDir)

            if(runtime == null) {
                logger.info('Official NeoForge runtime not found. Installing NeoForge runtime automatically.')
                this._installOfficialNeoForgeRuntime(officialMinecraftDir)
                runtime = this._findOfficialRuntime(officialMinecraftDir)
            }

            if(runtime != null) {
                this.neoForgeRuntimeId = runtime.id
                this.neoForgeCommonDir = officialMinecraftDir
                this.neoForgeLibPath = path.join(officialMinecraftDir, 'libraries')
                logger.info('Using official Minecraft directory for NeoForge runtime:', officialMinecraftDir)
                logger.info('Using NeoForge runtime id:', this.neoForgeRuntimeId)
                if(runtime.jar == null) {
                    logger.info('NeoForge generated version jar missing; using launcher-provided generated jar fallback.')
                }
            } else {
                logger.warn('Official NeoForge runtime is still missing. Falling back to launcher common directory.')
            }
        }
    }

    build() {
        logger.info('Using dedicated NeoForge process builder.')
        return super.build()
    }

    _officialMinecraftDir() {
        return process.env.APPDATA != null ? path.join(process.env.APPDATA, '.minecraft') : null
    }

    _defaultNeoForgeId() {
        return 'neoforge-' + this._neoForgeVersion()
    }

    _runtimeIdCandidates(minecraftDir) {
        const version = this._neoForgeVersion()
        const candidates = [
            this._defaultNeoForgeId(),
            this.vanillaManifest.id + '-neoforge-' + version,
            'neoforge-' + this.vanillaManifest.id + '-' + version
        ]

        const versionsDir = path.join(minecraftDir, 'versions')
        if(fs.existsSync(versionsDir)) {
            for(const entry of fs.readdirSync(versionsDir)) {
                const lower = entry.toLowerCase()
                if(lower.includes('neoforge') && lower.includes(version.toLowerCase())) {
                    candidates.push(entry)
                }
            }
        }

        return [...new Set(candidates)]
    }

    _findClientSrgJar(minecraftDir) {
        const librariesRoot = path.join(minecraftDir, 'libraries')
        if(!fs.existsSync(librariesRoot)) {
            return null
        }

        const stack = [librariesRoot]
        while(stack.length > 0) {
            const current = stack.pop()
            for(const entry of fs.readdirSync(current)) {
                const full = path.join(current, entry)
                const stat = fs.statSync(full)
                if(stat.isDirectory()) {
                    stack.push(full)
                } else if(entry.endsWith('-srg.jar') && entry.includes(this.vanillaManifest.id)) {
                    return full
                }
            }
        }

        return null
    }

    _findOfficialRuntime(minecraftDir) {
        const version = this._neoForgeVersion()
        const universalJar = path.join(minecraftDir, 'libraries', 'net', 'neoforged', 'neoforge', version, 'neoforge-' + version + '-universal.jar')
        const clientSrgJar = this._findClientSrgJar(minecraftDir)

        if(!fs.existsSync(universalJar) || clientSrgJar == null) {
            return null
        }

        for(const id of this._runtimeIdCandidates(minecraftDir)) {
            const jar = path.join(minecraftDir, 'versions', id, id + '.jar')
            const json = path.join(minecraftDir, 'versions', id, id + '.json')

            if(fs.existsSync(json)) {
                return {
                    id,
                    jar: fs.existsSync(jar) ? jar : null,
                    json,
                    universalJar,
                    clientSrgJar
                }
            }
        }

        return null
    }

    _ensureLauncherProfiles(minecraftDir) {
        const profilesPath = path.join(minecraftDir, 'launcher_profiles.json')
        if(fs.existsSync(profilesPath)) {
            return
        }

        const now = new Date().toISOString()
        const profiles = {
            profiles: {},
            selectedProfile: null,
            clientToken: 'ktz-launcher',
            authenticationDatabase: {},
            launcherVersion: {
                name: 'KTZ Launcher',
                format: 21
            },
            settings: {},
            analyticsToken: '',
            analyticsFailcount: 0,
            created: now
        }

        fs.ensureDirSync(minecraftDir)
        fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2), 'utf8')
        logger.info('Created minimal launcher_profiles.json for NeoForge installer:', profilesPath)
    }

    _installerUrl() {
        const version = this._neoForgeVersion()
        return 'https://maven.neoforged.net/releases/net/neoforged/neoforge/' + version + '/neoforge-' + version + '-installer.jar'
    }

    _installerPath() {
        const version = this._neoForgeVersion()
        return path.join(this.commonDir, 'installers', 'neoforge', version, 'neoforge-' + version + '-installer.jar')
    }

    _downloadInstallerIfNeeded() {
        const installerPath = this._installerPath()
        if(fs.existsSync(installerPath) && fs.statSync(installerPath).size > 1024 * 1024) {
            return installerPath
        }

        fs.ensureDirSync(path.dirname(installerPath))
        logger.info('Downloading NeoForge installer:', this._installerUrl())

        const psCommand = "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '" + this._installerUrl() + "' -OutFile '" + installerPath.replace(/'/g, "''") + "'"
        const result = child_process.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
            encoding: 'utf8',
            windowsHide: true
        })

        if(result.status !== 0 || !fs.existsSync(installerPath)) {
            logger.error('Failed to download NeoForge installer.', result.stderr || result.stdout)
            throw new Error('Failed to download NeoForge installer.')
        }

        return installerPath
    }

    _runInstallerAttempt(javaExec, installerPath, minecraftDir, args) {
        logger.info('Running NeoForge installer:', args.join(' '))
        const result = child_process.spawnSync(javaExec, ['-jar', installerPath].concat(args), {
            cwd: minecraftDir,
            encoding: 'utf8',
            windowsHide: true
        })

        if(result.stdout) {
            logger.info('NeoForge installer stdout:', result.stdout)
        }
        if(result.stderr) {
            logger.warn('NeoForge installer stderr:', result.stderr)
        }

        if(result.status !== 0) {
            logger.warn('NeoForge installer attempt failed with exit code ' + result.status + '.')
            return false
        }

        if(this._findOfficialRuntime(minecraftDir) != null) {
            logger.info('NeoForge runtime installation verified.')
            return true
        }

        logger.warn('NeoForge installer exited successfully, but runtime verification failed for this argument set.')
        return false
    }

    _installOfficialNeoForgeRuntime(minecraftDir) {
        try {
            fs.ensureDirSync(minecraftDir)
            this._ensureLauncherProfiles(minecraftDir)
            const installerPath = this._downloadInstallerIfNeeded()
            const javaExec = ConfigManager.getJavaExecutable(this.server.rawServer.id) || 'java'

            const attempts = [
                ['--install-client'],
                ['--installClient'],
                ['--install-client', minecraftDir],
                ['--installClient', minecraftDir]
            ]

            for(const args of attempts) {
                if(this._runInstallerAttempt(javaExec, installerPath, minecraftDir, args)) {
                    return true
                }
            }

            logger.error('All NeoForge installer attempts failed verification.')
            return false
        } catch(err) {
            logger.error('Unable to install NeoForge runtime automatically.', err)
            return false
        }
    }

    _neoForgeVersion() {
        const rawVersion = this.server.rawServer.ktz?.loaderVersion || '21.4.157'
        return String(rawVersion).replace('neoforge-', '')
    }

    _neoForgeId() {
        return this.neoForgeRuntimeId || this._defaultNeoForgeId()
    }

    _neoForgeVersionJar() {
        const id = this._neoForgeId()
        const version = this._neoForgeVersion()

        const officialJar = path.join(this.neoForgeCommonDir, 'versions', id, id + '.jar')
        if(fs.existsSync(officialJar)) {
            return officialJar
        }

        const sourceJar = path.join(this.commonDir, 'libraries', 'net', 'neoforged', 'neoforge', version, this._defaultNeoForgeId() + '.jar')
        const sourceJson = path.join(this.commonDir, 'versions', this._defaultNeoForgeId(), this._defaultNeoForgeId() + '.json')

        const targetDir = path.join(this.gameDir, 'versions', this._defaultNeoForgeId())
        const targetJar = path.join(targetDir, this._defaultNeoForgeId() + '.jar')
        const targetJson = path.join(targetDir, this._defaultNeoForgeId() + '.json')

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

        const preferred = path.join(this.neoForgeLibPath, artifact.path)
        if(fs.existsSync(preferred)) {
            return preferred
        }

        return path.join(this.libPath, artifact.path)
    }

    _vanillaLibraryPath(lib) {
        const artifact = lib.downloads?.artifact
        if(!artifact?.path) {
            return null
        }

        const preferred = path.join(this.neoForgeLibPath, artifact.path)
        if(fs.existsSync(preferred)) {
            return preferred
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
                add(this._vanillaLibraryPath(lib))
            }
        }

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
                const enabled = ProcessBuilder.isModEnabled(
                    modCfg[mdl.getVersionlessMavenIdentifier()],
                    mdl.getRequired()
                )

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

    _remapNeoForgeRuntimePath(value) {
        if(typeof value !== 'string') {
            return value
        }

        return value
            .replaceAll(this.libPath, this.neoForgeLibPath)
            .replaceAll(this.commonDir, this.neoForgeCommonDir)
    }

    _remapNeoForgeJvmArgument(value, previousArg) {
        if(typeof value !== 'string') {
            return value
        }

        // The classpath is already built path-by-path by _orderedNeoForgeLibraries().
        // Do not remap it wholesale because some vanilla/LWJGL libraries may only exist
        // in .mrslauncher/common while NeoForge-specific libraries exist in .minecraft.
        if(previousArg === '-cp' || previousArg === '-classpath') {
            return value
        }

        return this._remapNeoForgeRuntimePath(value)
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

        for(let i = 0; i < args.length; i++) {
            args[i] = this._remapNeoForgeJvmArgument(args[i], args[i - 1])
        }

        logger.info('NeoForge --version:', id)
        logger.info('NeoForge library directory:', this.neoForgeLibPath)
        return args
    }
}

module.exports = NeoForgeProcessBuilder
