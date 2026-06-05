// KTZ NeoForge runtime patch.
// NeoForge mods are copied into the instance mods folder.
// Official NeoForge launch puts NeoForge/FML libraries first and the generated NeoForge version jar last.

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
            const source = path.join(builder.commonDir, 'libraries', 'net', 'neoforged', 'neoforge', version, id + '.jar')
            const targetDir = path.join(builder.commonDir, 'versions', id)
            const target = path.join(targetDir, id + '.jar')

            if(fs.existsSync(source)){
                fs.ensureDirSync(targetDir)
                if(!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size){
                    fs.copySync(source, target)
                    console.log('[KTZ NeoForge] Copied generated NeoForge version jar to official-style path:', target)
                }
            }

            return target
        }

        function isNeoForgeCorePath(filePath){
            const p = String(filePath).replace(/\\/g, '/').toLowerCase()
            return p.includes('/net/neoforged/') ||
                p.includes('/cpw/mods/') ||
                p.includes('/net/minecraftforge/') ||
                p.includes('/net/fabricmc/sponge-mixin/') ||
                p.includes('/org/openjdk/nashorn/') ||
                p.includes('/org/jline/') ||
                p.includes('/commons-io/commons-io/') ||
                p.includes('/org/ow2/asm/')
        }

        function normalizeNeoForgeClasspath(cpArgs, versionJar){
            const seen = new Set()
            const cleaned = []

            for(const entry of cpArgs){
                if(!entry || entry === versionJar){
                    continue
                }
                if(seen.has(entry)){
                    continue
                }
                seen.add(entry)
                cleaned.push(entry)
            }

            const core = cleaned.filter(isNeoForgeCorePath)
            const rest = cleaned.filter(p => !isNeoForgeCorePath(p))
            const ordered = core.concat(rest)

            if(fs.existsSync(versionJar)){
                ordered.push(versionJar)
                console.log('[KTZ NeoForge] Ensured generated NeoForge version jar at end of classpath:', versionJar)
            } else {
                console.warn('[KTZ NeoForge] Missing generated NeoForge version jar:', versionJar)
            }

            console.log('[KTZ NeoForge] Reordered classpath. core=' + core.length + ', rest=' + rest.length)
            return ordered
        }

        ProcessBuilder.prototype.classpathArg = function(mods, tempNativePath){
            const cpArgs = originalClasspathArg.call(this, mods, tempNativePath)

            if(isNeoForgeBuild(this)){
                return normalizeNeoForgeClasspath(cpArgs, neoForgeVersionJar(this))
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
