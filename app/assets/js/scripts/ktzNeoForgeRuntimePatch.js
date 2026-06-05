// KTZ NeoForge runtime patch.
// NeoForge uses a dedicated process builder; this file only delegates from the stock launch path.

function ktzPatchNeoForgeRuntime(){
    try {
        const ProcessBuilder = require('./assets/js/processbuilder')
        const NeoForgeProcessBuilder = require('./assets/js/neoforgeprocessbuilder')

        if(ProcessBuilder.prototype.ktzNeoForgeRuntimePatched){
            return
        }

        ProcessBuilder.prototype.ktzNeoForgeRuntimePatched = true

        const originalBuild = ProcessBuilder.prototype.build

        function isNeoForgeBuild(builder){
            return builder.server?.rawServer?.ktz?.loader === 'neoforge' || String(builder.modManifest?.id || '').startsWith('neoforge-')
        }

        ProcessBuilder.prototype.build = function(){
            if(isNeoForgeBuild(this) && !this.usingNeoForgeLoader){
                console.log('[KTZ NeoForge] Delegating launch to dedicated NeoForgeProcessBuilder.')
                const pb = new NeoForgeProcessBuilder(
                    this.server,
                    this.vanillaManifest,
                    this.modManifest,
                    this.authUser,
                    this.launcherVersion
                )
                return pb.build()
            }

            return originalBuild.call(this)
        }
    } catch(err) {
        console.error('Unable to apply KTZ NeoForge runtime patch.', err)
    }
}

setTimeout(ktzPatchNeoForgeRuntime, 0)
