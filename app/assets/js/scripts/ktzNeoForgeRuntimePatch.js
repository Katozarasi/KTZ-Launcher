// KTZ runtime patch.
// Delegates NeoForge launches and prepares server-specific runtime payloads.

function ktzPatchNeoForgeRuntime(){
    try {
        const fs = require('fs-extra')
        const path = require('path')
        const ProcessBuilder = require('./assets/js/processbuilder')
        const NeoForgeProcessBuilder = require('./assets/js/neoforgeprocessbuilder')
        const ConfigManager = require('./assets/js/configmanager')

        if(ProcessBuilder.prototype.ktzNeoForgeRuntimePatched){
            return
        }

        ProcessBuilder.prototype.ktzNeoForgeRuntimePatched = true

        const originalBuild = ProcessBuilder.prototype.build

        function isNeoForgeBuild(builder){
            return builder.server?.rawServer?.ktz?.loader === 'neoforge' ||
                String(builder.modManifest?.id || '').startsWith('neoforge-')
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

                if(!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size){
                    fs.copySync(source, target)
                    console.log('[KTZ Shaderpacks] Installed bundled shaderpack:', target)
                }
            }

            const preferred = shaderFiles.includes('KatoriShaderpacks.zip')
                ? 'KatoriShaderpacks.zip'
                : shaderFiles[0]
            const optionsPath = path.join(gameDir, 'optionsshaders.txt')
            const markerPath = path.join(gameDir, '.ktz-shaderpack-default-applied')

            if(fs.existsSync(markerPath) || fs.existsSync(optionsPath)){
                console.log('[KTZ Shaderpacks] Bundled shaderpack is available; preserving existing shader options.')
                return
            }

            fs.writeFileSync(
                optionsPath,
                'shaderPack=' + preferred + '\n' + 'enableShaders=true\n',
                'utf8'
            )
            fs.writeFileSync(markerPath, new Date().toISOString() + '\n', 'utf8')
            console.log('[KTZ Shaderpacks] Selected default shaderpack:', preferred)
        }

        ProcessBuilder.prototype.build = function(){
            const serverId = this.server.rawServer.id

            if(isNeoForgeBuild(this) && !this.usingNeoForgeLoader){
                console.log('[KTZ NeoForge] Delegating launch to dedicated NeoForgeProcessBuilder.')

                return (() => {
                    installBundledShaderpacks(serverId)

                    const pb = new NeoForgeProcessBuilder(
                        this.server,
                        this.vanillaManifest,
                        this.modManifest,
                        this.authUser,
                        this.launcherVersion
                    )

                    return pb.build()
                })()
            }

            return originalBuild.call(this)
        }
    } catch(err) {
        console.error('Unable to apply KTZ runtime patch.', err)
    }
}

setTimeout(ktzPatchNeoForgeRuntime, 0)
