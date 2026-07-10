// KTZ NeoForge runtime patch.
// NeoForge uses a dedicated process builder; this file also installs server-specific runtime payloads.

function ktzPatchNeoForgeRuntime(){
    try {
        const fs = require('fs-extra')
        const path = require('path')
        const child_process = require('child_process')
        const ProcessBuilder = require('./assets/js/processbuilder')
        const NeoForgeProcessBuilder = require('./assets/js/neoforgeprocessbuilder')
        const ConfigManager = require('./assets/js/configmanager')

        if(ProcessBuilder.prototype.ktzNeoForgeRuntimePatched){
            return
        }

        ProcessBuilder.prototype.ktzNeoForgeRuntimePatched = true

        const originalBuild = ProcessBuilder.prototype.build

        const TOKETMON_PACK = {
            serverId: 'toketmon',
            version: 'v1',
            fileName: 'toketmon-client-pack-v1.zip',
            url: 'https://github.com/Katozarasi/KTZ-Launcher/releases/download/toketmon-client-pack-v1/toketmon-client-pack-v1.zip'
        }

        function isNeoForgeBuild(builder){
            return builder.server?.rawServer?.ktz?.loader === 'neoforge' || String(builder.modManifest?.id || '').startsWith('neoforge-')
        }

        function javaMajor(javaExe){
            try {
                const result = child_process.spawnSync(javaExe, ['-version'], {
                    encoding: 'utf8',
                    windowsHide: true
                })
                const text = String(result.stderr || '') + String(result.stdout || '')
                const match = text.match(/version\s+"(\d+)/)
                return match != null ? Number.parseInt(match[1]) : null
            } catch(_err) {
                return null
            }
        }

        function bundledJava21(){
            const runtimeRoot = path.join(ConfigManager.getDataDirectory(), 'runtime', 'x64')
            if(!fs.existsSync(runtimeRoot)){
                return null
            }

            const candidates = []
            for(const entry of fs.readdirSync(runtimeRoot)){
                const javaExe = path.join(runtimeRoot, entry, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
                if(fs.existsSync(javaExe)){
                    candidates.push(javaExe)
                }
            }

            for(const candidate of candidates){
                if(javaMajor(candidate) === 21){
                    return candidate
                }
            }

            for(const candidate of candidates){
                if(String(candidate).includes('jdk-21')){
                    return candidate
                }
            }

            return null
        }

        function withBundledJava21(serverId, fn){
            const forcedJava = bundledJava21()
            const originalGetJavaExecutable = ConfigManager.getJavaExecutable

            if(forcedJava != null){
                console.log('[KTZ Runtime] Forcing bundled Java 21 for launch:', forcedJava)
                ConfigManager.getJavaExecutable = function(requestedServerId){
                    if(requestedServerId === serverId){
                        return forcedJava
                    }
                    return originalGetJavaExecutable(requestedServerId)
                }
            } else {
                console.warn('[KTZ Runtime] Bundled Java 21 was not found. Using configured Java executable.')
            }

            try {
                return fn()
            } finally {
                ConfigManager.getJavaExecutable = originalGetJavaExecutable
            }
        }

        function shaderpackSourceDir(serverId){
            return path.join(__dirname, '..', '..', 'shaderpacks', serverId)
        }

        function installBundledShaderpacks(serverId){
            const sourceDir = shaderpackSourceDir(serverId)
            if(!fs.existsSync(sourceDir)){
                console.log('[KTZ Shaderpacks] No bundled shaderpacks directory:', sourceDir)
                return
            }

            const shaderFiles = fs.readdirSync(sourceDir)
                .filter(file => file.toLowerCase().endsWith('.zip'))
                .sort((a, b) => a.localeCompare(b))

            if(shaderFiles.length === 0){
                console.log('[KTZ Shaderpacks] No bundled shaderpack zip files found:', sourceDir)
                return
            }

            const gameDir = path.join(ConfigManager.getInstanceDirectory(), serverId)
            const targetDir = path.join(gameDir, 'shaderpacks')
            fs.ensureDirSync(targetDir)

            for(const file of shaderFiles){
                const source = path.join(sourceDir, file)
                const target = path.join(targetDir, file)
                const buffer = fs.readFileSync(source)

                if(!fs.existsSync(target) || fs.statSync(target).size !== buffer.length){
                    fs.writeFileSync(target, buffer)
                    console.log('[KTZ Shaderpacks] Installed bundled shaderpack:', target)
                }
            }

            const preferred = shaderFiles.includes('KatoriShaderpacks.zip') ? 'KatoriShaderpacks.zip' : shaderFiles[0]
            const optionsPath = path.join(gameDir, 'optionsshaders.txt')
            const markerPath = path.join(gameDir, '.ktz-shaderpack-default-applied')

            if(fs.existsSync(markerPath) || fs.existsSync(optionsPath)){
                console.log('[KTZ Shaderpacks] Bundled shaderpack is available; preserving existing shader options.')
                return
            }

            const lines = [
                'shaderPack=' + preferred,
                'enableShaders=true'
            ]

            fs.writeFileSync(optionsPath, lines.join('\n') + '\n', 'utf8')
            fs.writeFileSync(markerPath, new Date().toISOString() + '\n', 'utf8')
            console.log('[KTZ Shaderpacks] Selected default shaderpack:', preferred)
        }

        function quotePowerShell(value){
            return "'" + String(value).replace(/'/g, "''") + "'"
        }

        function runPowerShell(command){
            const result = child_process.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
                encoding: 'utf8',
                windowsHide: true
            })
            if(result.status !== 0){
                throw new Error((result.stderr || result.stdout || 'PowerShell command failed').trim())
            }
            return result
        }

        function downloadToketmonPayload(zipPath, forceDownload = false){
            fs.ensureDirSync(path.dirname(zipPath))

            if(forceDownload && fs.existsSync(zipPath)){
                fs.removeSync(zipPath)
                console.log('[KTZ Toketmon] Removed stale downloaded client pack:', zipPath)
            }

            if(fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1024 * 1024){
                console.log('[KTZ Toketmon] Client pack already downloaded:', zipPath)
                return
            }

            console.log('[KTZ Toketmon] Downloading client pack:', TOKETMON_PACK.url)
            const command = "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri " + quotePowerShell(TOKETMON_PACK.url) + " -OutFile " + quotePowerShell(zipPath)
            runPowerShell(command)
        }

        function extractToketmonPayload(zipPath, extractDir){
            fs.removeSync(extractDir)
            fs.ensureDirSync(extractDir)
            console.log('[KTZ Toketmon] Extracting client pack:', extractDir)
            const command = 'Expand-Archive -LiteralPath ' + quotePowerShell(zipPath) + ' -DestinationPath ' + quotePowerShell(extractDir) + ' -Force'
            runPowerShell(command)
        }

        function copyDirectoryContents(sourceDir, targetDir){
            if(!fs.existsSync(sourceDir)){
                return false
            }
            fs.ensureDirSync(targetDir)
            fs.copySync(sourceDir, targetDir, { overwrite: true, errorOnExist: false })
            return true
        }

        function countFiles(dir, predicate = null){
            if(!fs.existsSync(dir)){
                return 0
            }

            let total = 0
            for(const entry of fs.readdirSync(dir)){
                const full = path.join(dir, entry)
                const stat = fs.statSync(full)
                if(stat.isDirectory()){
                    total += countFiles(full, predicate)
                } else if(predicate == null || predicate(full)){
                    total++
                }
            }
            return total
        }

        function removeGitkeepFiles(dir){
            if(!fs.existsSync(dir)){
                return
            }

            for(const entry of fs.readdirSync(dir)){
                const full = path.join(dir, entry)
                const stat = fs.statSync(full)
                if(stat.isDirectory()){
                    removeGitkeepFiles(full)
                } else if(entry === '.gitkeep'){
                    fs.removeSync(full)
                }
            }
        }

        function hasPayloadFiles(dir, type){
            if(!fs.existsSync(dir)){
                return false
            }

            switch(type){
                case 'mods':
                    return countFiles(dir, file => {
                        const lower = file.toLowerCase()
                        return lower.endsWith('.jar') || lower.endsWith('.zip')
                    }) > 0
                case 'resourcepacks':
                    return countFiles(dir, file => file.toLowerCase().endsWith('.zip')) > 0
                case 'datapacks':
                    return countFiles(dir, file => file.toLowerCase().endsWith('.zip') || path.basename(file).toLowerCase() === 'pack.mcmeta') > 0
                case 'config':
                    return countFiles(dir, file => path.basename(file) !== '.gitkeep') > 0
                default:
                    return countFiles(dir) > 0
            }
        }

        function hasValidToketmonPayload(gameDir){
            const modsDir = path.join(gameDir, 'mods')
            const configDir = path.join(gameDir, 'config')
            const resourcepacksDir = path.join(gameDir, 'resourcepacks')

            const modCount = countFiles(modsDir, file => {
                const lower = file.toLowerCase()
                return lower.endsWith('.jar') || lower.endsWith('.zip')
            })
            const configCount = countFiles(configDir, file => path.basename(file) !== '.gitkeep')
            const resourcepackCount = countFiles(resourcepacksDir, file => file.toLowerCase().endsWith('.zip'))

            console.log('[KTZ Toketmon] Payload check: mods=' + modCount + ', config=' + configCount + ', resourcepacks=' + resourcepackCount)
            return modCount > 0 && configCount > 0 && resourcepackCount > 0
        }

        function collectDirectories(rootDir){
            const dirs = []
            if(!fs.existsSync(rootDir)){
                return dirs
            }

            const stack = [rootDir]
            while(stack.length > 0){
                const current = stack.pop()
                dirs.push(current)
                for(const entry of fs.readdirSync(current)){
                    const full = path.join(current, entry)
                    try {
                        if(fs.statSync(full).isDirectory()){
                            stack.push(full)
                        }
                    } catch(_err) {
                        // Ignore transient filesystem errors while scanning extracted payloads.
                    }
                }
            }
            return dirs
        }

        function scorePayloadDir(dir, type){
            if(!fs.existsSync(dir)){
                return 0
            }

            switch(type){
                case 'mods':
                    return countFiles(dir, file => {
                        const lower = file.toLowerCase()
                        return lower.endsWith('.jar') || lower.endsWith('.zip')
                    })
                case 'resourcepacks':
                    return countFiles(dir, file => file.toLowerCase().endsWith('.zip'))
                case 'datapacks':
                    return countFiles(dir, file => file.toLowerCase().endsWith('.zip') || path.basename(file).toLowerCase() === 'pack.mcmeta')
                case 'config':
                    return countFiles(dir, file => path.basename(file) !== '.gitkeep')
                default:
                    return countFiles(dir)
            }
        }

        function findPayloadDir(extractDir, type){
            const expectedNames = type === 'datapacks' ? ['datapacks', 'datapack'] : [type]
            const directCandidates = []

            for(const name of expectedNames){
                directCandidates.push(path.join(extractDir, name))
                directCandidates.push(path.join(extractDir, 'build', 'toketmon-pack', name))
                directCandidates.push(path.join(extractDir, 'toketmon-pack', name))
                directCandidates.push(path.join(extractDir, 'files', name, 'toketmon'))
            }

            for(const candidate of directCandidates){
                if(hasPayloadFiles(candidate, type)){
                    console.log('[KTZ Toketmon] Selected ' + type + ' payload source:', candidate)
                    return candidate
                }
            }

            const allDirs = collectDirectories(extractDir)
            let best = null
            let bestScore = 0

            for(const dir of allDirs){
                const base = path.basename(dir).toLowerCase()
                const parent = path.basename(path.dirname(dir)).toLowerCase()
                const normalized = dir.toLowerCase().replaceAll('\\', '/')
                const looksLikePayloadDir = expectedNames.includes(base) ||
                    (base === 'toketmon' && expectedNames.includes(parent)) ||
                    expectedNames.some(name => normalized.endsWith('/files/' + name + '/toketmon'))

                if(!looksLikePayloadDir){
                    continue
                }

                const score = scorePayloadDir(dir, type)
                if(score > bestScore){
                    best = dir
                    bestScore = score
                }
            }

            if(best != null){
                console.log('[KTZ Toketmon] Selected ' + type + ' payload source:', best, 'files=' + bestScore)
                return best
            }

            console.warn('[KTZ Toketmon] Could not find non-empty ' + type + ' payload in extracted client pack:', extractDir)
            return null
        }

        function installToketmonPayload(serverId){
            if(serverId !== TOKETMON_PACK.serverId){
                return
            }

            const gameDir = path.join(ConfigManager.getInstanceDirectory(), serverId)
            const packRoot = path.join(ConfigManager.getCommonDirectory(), 'packs', 'toketmon')
            const zipPath = path.join(packRoot, TOKETMON_PACK.fileName)
            const extractDir = path.join(packRoot, 'extracted', TOKETMON_PACK.version)
            const markerPath = path.join(gameDir, '.ktz-toketmon-client-pack-' + TOKETMON_PACK.version)

            if(fs.existsSync(markerPath) && hasValidToketmonPayload(gameDir)){
                console.log('[KTZ Toketmon] Client pack already installed for this instance.')
                return
            }

            if(fs.existsSync(markerPath)){
                console.warn('[KTZ Toketmon] Install marker exists, but payload is incomplete. Reinstalling client pack.')
                fs.removeSync(markerPath)
            }

            fs.ensureDirSync(gameDir)
            downloadToketmonPayload(zipPath, true)
            extractToketmonPayload(zipPath, extractDir)

            for(const managedDir of ['mods', 'config', 'datapacks', 'resourcepacks']){
                fs.removeSync(path.join(gameDir, managedDir))
            }

            const layout = [
                { source: findPayloadDir(extractDir, 'mods'), target: path.join(gameDir, 'mods'), label: 'mods' },
                { source: findPayloadDir(extractDir, 'config'), target: path.join(gameDir, 'config'), label: 'config' },
                { source: findPayloadDir(extractDir, 'datapacks'), target: path.join(gameDir, 'datapacks'), label: 'datapacks' },
                { source: findPayloadDir(extractDir, 'resourcepacks'), target: path.join(gameDir, 'resourcepacks'), label: 'resourcepacks' }
            ]

            let installedAny = false
            for(const item of layout){
                if(item.source != null && copyDirectoryContents(item.source, item.target)){
                    installedAny = true
                    removeGitkeepFiles(item.target)
                    console.log('[KTZ Toketmon] Installed ' + item.label + ' payload:', item.target)
                }
            }

            if(!installedAny){
                throw new Error('Toketmon client pack did not contain expected folders: mods, config, datapacks, resourcepacks')
            }

            if(!hasValidToketmonPayload(gameDir)){
                throw new Error('Toketmon client pack installation finished, but installed payload is incomplete.')
            }

            fs.writeFileSync(markerPath, new Date().toISOString() + '\n', 'utf8')
            console.log('[KTZ Toketmon] Client pack installation complete.')
        }

        ProcessBuilder.prototype.build = function(){
            const serverId = this.server.rawServer.id

            installToketmonPayload(serverId)

            if(serverId === TOKETMON_PACK.serverId){
                return withBundledJava21(serverId, () => originalBuild.call(this))
            }

            if(isNeoForgeBuild(this) && !this.usingNeoForgeLoader){
                console.log('[KTZ NeoForge] Delegating launch to dedicated NeoForgeProcessBuilder.')

                return withBundledJava21(serverId, () => {
                    installBundledShaderpacks(serverId)

                    const pb = new NeoForgeProcessBuilder(
                        this.server,
                        this.vanillaManifest,
                        this.modManifest,
                        this.authUser,
                        this.launcherVersion
                    )

                    return pb.build()
                })
            }

            return originalBuild.call(this)
        }
    } catch(err) {
        console.error('Unable to apply KTZ runtime patch.', err)
    }
}

setTimeout(ktzPatchNeoForgeRuntime, 0)
