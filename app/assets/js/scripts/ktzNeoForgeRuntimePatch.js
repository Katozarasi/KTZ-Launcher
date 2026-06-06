// KTZ NeoForge runtime patch.
// NeoForge uses a dedicated process builder; this file only delegates from the stock launch path.

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
            let lines = []

            if(fs.existsSync(optionsPath)){
                lines = fs.readFileSync(optionsPath, 'utf8').split(/\r?\n/).filter(line => line.trim().length > 0)
            }

            const setOption = (key, value) => {
                const prefix = key + '='
                const idx = lines.findIndex(line => line.startsWith(prefix))
                if(idx > -1){
                    lines[idx] = prefix + value
                } else {
                    lines.push(prefix + value)
                }
            }

            setOption('shaderPack', preferred)
            setOption('enableShaders', 'true')

            fs.writeFileSync(optionsPath, lines.join('\n') + '\n', 'utf8')
            console.log('[KTZ Shaderpacks] Selected default shaderpack:', preferred)
        }

        ProcessBuilder.prototype.build = function(){
            if(isNeoForgeBuild(this) && !this.usingNeoForgeLoader){
                console.log('[KTZ NeoForge] Delegating launch to dedicated NeoForgeProcessBuilder.')

                const forcedJava = bundledJava21()
                const originalGetJavaExecutable = ConfigManager.getJavaExecutable
                const serverId = this.server.rawServer.id

                if(forcedJava != null){
                    console.log('[KTZ NeoForge] Forcing bundled Java 21 for NeoForge launch:', forcedJava)
                    ConfigManager.getJavaExecutable = function(requestedServerId){
                        if(requestedServerId === serverId){
                            return forcedJava
                        }
                        return originalGetJavaExecutable(requestedServerId)
                    }
                } else {
                    console.warn('[KTZ NeoForge] Bundled Java 21 was not found. Using configured Java executable.')
                }

                installBundledShaderpacks(serverId)

                const pb = new NeoForgeProcessBuilder(
                    this.server,
                    this.vanillaManifest,
                    this.modManifest,
                    this.authUser,
                    this.launcherVersion
                )

                try {
                    return pb.build()
                } finally {
                    ConfigManager.getJavaExecutable = originalGetJavaExecutable
                }
            }

            return originalBuild.call(this)
        }
    } catch(err) {
        console.error('Unable to apply KTZ NeoForge runtime patch.', err)
    }
}

setTimeout(ktzPatchNeoForgeRuntime, 0)
