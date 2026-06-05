// KTZ NeoForge runtime patch.
// NeoForge is safest when extra mods are placed in the instance mods folder.
// This avoids passing a Forge-style --fml.modLists list and makes the vanilla client jar visible to the module layer.

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
        const originalConstructJVMArguments113 = ProcessBuilder.prototype._constructJVMArguments113

        function isNeoForgeBuild(builder){
            return builder.server?.rawServer?.ktz?.loader === 'neoforge' || String(builder.modManifest?.id || '').startsWith('neoforge-')
        }

        function vanillaClientJar(builder){
            const version = builder.vanillaManifest.id
            return path.join(builder.commonDir, 'versions', version, version + '.jar')
        }

        function moduleSafeVanillaClientJar(builder){
            const source = vanillaClientJar(builder)
            const version = builder.vanillaManifest.id
            const targetDir = path.join(builder.gameDir, '.ktz-neoforge')
            const target = path.join(targetDir, 'minecraft-' + version + '.jar')
            fs.ensureDirSync(targetDir)
            if(!fs.existsSync(target)){
                fs.copySync(source, target)
            }
            return target
        }

        function addToSeparatedPath(value, filePath){
            const sep = ProcessBuilder.getClasspathSeparator()
            const parts = String(value || '').split(sep).filter(Boolean)
            if(!parts.includes(filePath)){
                parts.unshift(filePath)
            }
            return parts.join(sep)
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

        ProcessBuilder.prototype._constructJVMArguments113 = function(mods, tempNativePath){
            const args = originalConstructJVMArguments113.call(this, mods, tempNativePath)

            if(isNeoForgeBuild(this)){
                const safeVanillaClient = moduleSafeVanillaClientJar(this)
                const modulePathIndex = args.indexOf('-p')
                if(modulePathIndex > -1 && args[modulePathIndex + 1] != null){
                    args[modulePathIndex + 1] = addToSeparatedPath(args[modulePathIndex + 1], safeVanillaClient)
                    console.log('[KTZ NeoForge] Added module-safe vanilla client jar to module path:', safeVanillaClient)
                } else {
                    args.unshift(addToSeparatedPath('', safeVanillaClient))
                    args.unshift('-p')
                    console.log('[KTZ NeoForge] Created module path with module-safe vanilla client jar:', safeVanillaClient)
                }
            }

            return args
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
