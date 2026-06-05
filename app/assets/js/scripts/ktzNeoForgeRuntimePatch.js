// KTZ NeoForge runtime patch.
// NeoForge mods are copied into the instance mods folder.
// Minecraft client jar must stay on classpath only; generated NeoForge version jar is also required on classpath.

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

        function neoForgeVersionJar(builder){
            const id = builder.modManifest?.id || 'neoforge-21.4.157'
            const version = id.replace('neoforge-', '')
            return path.join(builder.commonDir, 'libraries', 'net', 'neoforged', 'neoforge', version, id + '.jar')
        }

        function addClasspathEntry(cpArgs, filePath, label){
            if(fs.existsSync(filePath) && !cpArgs.includes(filePath)){
                cpArgs.push(filePath)
                console.log('[KTZ NeoForge] Added ' + label + ' to classpath:', filePath)
            }
        }

        ProcessBuilder.prototype.classpathArg = function(mods, tempNativePath){
            const cpArgs = originalClasspathArg.call(this, mods, tempNativePath)

            if(isNeoForgeBuild(this)){
                addClasspathEntry(cpArgs, vanillaClientJar(this), 'vanilla client jar')
                addClasspathEntry(cpArgs, neoForgeVersionJar(this), 'generated NeoForge version jar')
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
