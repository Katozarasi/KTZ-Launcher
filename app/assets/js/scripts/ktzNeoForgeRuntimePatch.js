// KTZ NeoForge runtime patch.
// NeoForge mods are copied into the instance mods folder.
// Do not put the Minecraft client jar on the Java module path; it is not a valid Java module.

function ktzPatchNeoForgeRuntime(){
    try {
        const fs = require('fs-extra')
        const path = require('path')
        const ProcessBuilder = require('./assets/js/processbuilder')

        if(ProcessBuilder.prototype.ktzNeoForgeRuntimePatched){
            return
        }

        ProcessBuilder.prototype.ktzNeoForgeRuntimePatched = true

        const originalClasspathArg = ProcessBuilder.prototype.classpathArg
        const originalConstructModList = ProcessBuilder.prototype.constructModList

        function isNeoForgeBuild(builder){
            return builder.server?.rawServer?.ktz?.loader === 'neoforge' || String(builder.modManifest?.id || '').startsWith('neoforge-')
        }

        function vanillaClientJar(builder){
            const version = builder.vanillaManifest.id
            return path.join(builder.commonDir, 'versions', version, version + '.jar')
        }

        ProcessBuilder.prototype.classpathArg = function(mods, tempNativePath){
            const cpArgs = originalClasspathArg.call(this, mods, tempNativePath)

            if(isNeoForgeBuild(this)){
                const vanillaClient = vanillaClientJar(this)
                if(!cpArgs.includes(vanillaClient)){
                    cpArgs.unshift(vanillaClient)
                    console.log('[KTZ NeoForge] Added vanilla client jar to classpath:', vanillaClient)
                }
            }

            return cpArgs
        }

        ProcessBuilder.prototype.constructModList = function(mods){
            if(!isNeoForgeBuild(this)){
                return originalConstructModList.call(this, mods)
            }

            const modsDir = path.join(this.gameDir, 'mods')
            fs.ensureDirSync(modsDir)

            for(const entry of fs.readdirSync(modsDir)){
                if(entry.toLowerCase().endsWith('.jar')){
                    fs.removeSync(path.join(modsDir, entry))
                }
            }

            for(const mod of mods){
                const source = mod.getPath()
                const target = path.join(modsDir, path.basename(source))
                fs.copySync(source, target)
                console.log('[KTZ NeoForge] Copied mod to instance mods folder:', target)
            }

            console.log('[KTZ NeoForge] Using standard mods folder discovery instead of --fml.modLists.')
            return []
        }
    } catch(err) {
        console.error('Unable to apply KTZ NeoForge runtime patch.', err)
    }
}

setTimeout(ktzPatchNeoForgeRuntime, 0)
