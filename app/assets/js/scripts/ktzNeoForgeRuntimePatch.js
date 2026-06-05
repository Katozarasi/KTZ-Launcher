// KTZ NeoForge runtime patch.
// NeoForge needs the vanilla client jar visible during launch.

function ktzPatchNeoForgeClasspath(){
    try {
        const path = require('path')
        const ProcessBuilder = require('./assets/js/processbuilder')

        if(ProcessBuilder.prototype.ktzNeoForgeClasspathPatched){
            return
        }

        ProcessBuilder.prototype.ktzNeoForgeClasspathPatched = true
        const originalClasspathArg = ProcessBuilder.prototype.classpathArg

        ProcessBuilder.prototype.classpathArg = function(mods, tempNativePath){
            const cpArgs = originalClasspathArg.call(this, mods, tempNativePath)
            const isNeoForge = this.server?.rawServer?.ktz?.loader === 'neoforge' || String(this.modManifest?.id || '').startsWith('neoforge-')

            if(isNeoForge){
                const version = this.vanillaManifest.id
                const vanillaClient = path.join(this.commonDir, 'versions', version, version + '.jar')
                if(!cpArgs.includes(vanillaClient)){
                    cpArgs.unshift(vanillaClient)
                    console.log('[KTZ NeoForge] Added vanilla client jar to classpath:', vanillaClient)
                }
            }

            return cpArgs
        }
    } catch(err) {
        console.error('Unable to apply KTZ NeoForge classpath patch.', err)
    }
}

setTimeout(ktzPatchNeoForgeClasspath, 0)
