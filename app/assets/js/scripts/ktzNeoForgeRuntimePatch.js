// KTZ NeoForge runtime patch.
// NeoForge mods are copied into the instance mods folder.
// Official NeoForge launch uses the generated neoforge version jar on the classpath.

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

        function neoForgeId(builder){
            const rawVersion = builder.server?.rawServer?.ktz?.loaderVersion || '21.4.157'
            const version = String(rawVersion).replace('neoforge-', '')
            return 'neoforge-' + version
        }

        function neoForgeVersionJar(builder){
            const id = neoForgeId(builder)
            const version = id.replace('neoforge-', '')
            return path.join(builder.commonDir, 'libraries', 'net', 'neoforged', 'neoforge', version, id + '.jar')
        }

        function ensureClasspathEntry(cpArgs, filePath, label){
            if(!fs.existsSync(filePath)){
                console.warn('[KTZ NeoForge] Missing ' + label + ':', filePath)
                return
            }

            const existingIndex = cpArgs.indexOf(filePath)
            if(existingIndex > -1){
                cpArgs.splice(existingIndex, 1)
            }

            cpArgs.push(filePath)
            console.log('[KTZ NeoForge] Ensured ' + label + ' on classpath:', filePath)
        }

        ProcessBuilder.prototype.classpathArg = function(mods, tempNativePath){
            const cpArgs = originalClasspathArg.call(this, mods, tempNativePath)

            if(isNeoForgeBuild(this)){
                ensureClasspathEntry(cpArgs, neoForgeVersionJar(this), 'generated NeoForge version jar')
            }

            return cpArgs
        }

        ProcessBuilder.prototype._constructJVMArguments113 = function(mods, tempNativePath){
            const args = originalConstructJVMArguments113.call(this, mods, tempNativePath)

            if(isNeoForgeBuild(this)){
                const idx = args.indexOf('--version')
                if(idx > -1 && args[idx + 1] != null){
                    args[idx + 1] = neoForgeId(this)
                    console.log('[KTZ NeoForge] Set --version to:', args[idx + 1])
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
