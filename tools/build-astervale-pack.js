const childProcess = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const defaultProfile = 'C:\\Users\\TK\\AppData\\Roaming\\ModrinthApp\\profiles\\NeoForge 1.21.4'
const defaultBuildRoot = 'E:\\Codex\\Builds\\KTZ-AsterVale'
const manifestPath = path.join(projectRoot, 'docs', 'packs', 'astervale.json')
const inventoryPath = path.join(projectRoot, 'docs', 'packs', 'astervale-files.json')

const CONFIG_FILES = [
    'dreamdisplays/client-display-settings.json',
    'emotecraft.json',
    'katoquest-hud.properties',
    'MouseTweaks.cfg',
    'skinlayers.json',
    'sodium-mixins.properties',
    'sodium-options.json',
    'transition.json',
    'trender.json'
]

function argument(name, fallback){
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 && process.argv[index + 1] != null ? process.argv[index + 1] : fallback
}

function assertSafeBuildPath(target){
    const resolved = path.resolve(target)
    const root = path.parse(resolved).root
    if(resolved === root || resolved === path.resolve(projectRoot) || resolved.length < root.length + 12){
        throw new Error(`Refusing to use unsafe build path: ${resolved}`)
    }
}

function hashFile(file){
    const hash = crypto.createHash('sha256')
    const fd = fs.openSync(file, 'r')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    try {
        while(true){
            const bytes = fs.readSync(fd, buffer, 0, buffer.length, null)
            if(bytes === 0){
                break
            }
            hash.update(buffer.subarray(0, bytes))
        }
    } finally {
        fs.closeSync(fd)
    }
    return hash.digest('hex')
}

function ensureDirectory(dir){
    fs.mkdirSync(dir, { recursive: true })
}

function copyManagedFile(source, packRoot, relativePath, inventory){
    if(!fs.existsSync(source) || !fs.statSync(source).isFile()){
        return false
    }
    const normalized = relativePath.replaceAll('\\', '/')
    const destination = path.join(packRoot, ...normalized.split('/'))
    ensureDirectory(path.dirname(destination))
    fs.copyFileSync(source, destination)
    inventory.push({
        path: normalized,
        size: fs.statSync(destination).size,
        sha256: hashFile(destination)
    })
    return true
}

function copyManagedTree(sourceRoot, packRoot, targetRoot, inventory, predicate){
    if(!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()){
        return []
    }

    const copied = []
    const visit = (current, relativeDir = '') => {
        const entries = fs.readdirSync(current, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        for(const entry of entries){
            const relative = relativeDir.length > 0 ? `${relativeDir}/${entry.name}` : entry.name
            const source = path.join(current, entry.name)
            if(entry.isDirectory()){
                visit(source, relative)
            } else if(entry.isFile() && predicate(source, relative)){
                const target = `${targetRoot}/${relative}`
                if(copyManagedFile(source, packRoot, target, inventory)){
                    copied.push(target)
                }
            }
        }
    }
    visit(sourceRoot)
    return copied
}

function readJson(file, fallback){
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch(_err) {
        return fallback
    }
}

function diffInventories(previous, current){
    const oldMap = new Map((previous.files || []).map(item => [item.path, item]))
    const newMap = new Map(current.files.map(item => [item.path, item]))
    const added = []
    const removed = []
    const changed = []

    for(const [file, item] of newMap){
        const old = oldMap.get(file)
        if(old == null){
            added.push(file)
        } else if(old.size !== item.size || old.sha256 !== item.sha256){
            changed.push(file)
        }
    }
    for(const file of oldMap.keys()){
        if(!newMap.has(file)){
            removed.push(file)
        }
    }
    return { added, removed, changed }
}

function quotePowerShell(value){
    return `'${String(value).replaceAll('\'', '\'\'')}'`
}

function createZip(packRoot, zipPath){
    if(process.platform !== 'win32'){
        throw new Error('Aster Vale pack creation currently requires Windows PowerShell.')
    }
    const command = [
        '$ProgressPreference=\'SilentlyContinue\'',
        `Compress-Archive -Path ${quotePowerShell(path.join(packRoot, '*'))} -DestinationPath ${quotePowerShell(zipPath)} -CompressionLevel Optimal -Force`
    ].join('; ')
    const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024
    })
    if(result.status !== 0){
        throw new Error((result.stderr || result.stdout || 'Compress-Archive failed').trim())
    }
}

function printDiff(diff){
    for(const [label, files] of Object.entries({ Added: diff.added, Removed: diff.removed, Changed: diff.changed })){
        console.log(`${label}: ${files.length}`)
        for(const file of files){
            console.log(`  - ${file}`)
        }
    }
}

function main(){
    const manifest = readJson(manifestPath, null)
    if(manifest == null){
        throw new Error(`Missing manifest: ${manifestPath}`)
    }

    const profile = path.resolve(argument('profile', process.env.KTZ_ASTERVALE_PROFILE || defaultProfile))
    const version = argument('version', manifest.version)
    const buildRoot = path.resolve(argument('output-root', process.env.KTZ_PACK_BUILD_ROOT || defaultBuildRoot), version)
    const packRoot = path.join(buildRoot, 'pack')
    const fileName = `astervale-client-pack-${version}.zip`
    const zipPath = path.join(buildRoot, fileName)

    assertSafeBuildPath(buildRoot)
    if(!fs.existsSync(path.join(profile, 'mods'))){
        throw new Error(`NeoForge profile mods directory was not found: ${profile}`)
    }

    fs.rmSync(buildRoot, { recursive: true, force: true })
    ensureDirectory(packRoot)

    const inventory = []
    const modFiles = fs.readdirSync(path.join(profile, 'mods'), { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.jar'))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b, 'ko'))
    for(const file of modFiles){
        copyManagedFile(path.join(profile, 'mods', file), packRoot, `mods/${file}`, inventory)
    }

    for(const file of CONFIG_FILES){
        copyManagedFile(path.join(profile, 'config', ...file.split('/')), packRoot, `config/${file}`, inventory)
    }

    const resourcePackDir = path.join(profile, 'resourcepacks')
    if(fs.existsSync(resourcePackDir)){
        const resourcePacks = fs.readdirSync(resourcePackDir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.zip'))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b, 'ko'))
        for(const file of resourcePacks){
            copyManagedFile(path.join(resourcePackDir, file), packRoot, `resourcepacks/${file}`, inventory)
        }
    }

    const emoteFiles = copyManagedTree(
        path.join(profile, 'emotes'),
        packRoot,
        'emotes',
        inventory,
        file => file.toLowerCase().endsWith('.emotecraft')
    )

    for(const required of ['mods', 'config', 'resourcepacks', 'emotes']){
        ensureDirectory(path.join(packRoot, required))
    }
    if(inventory.filter(item => item.path.startsWith('mods/')).length === 0){
        throw new Error('The pack did not contain any client mod JAR files.')
    }
    if(emoteFiles.length === 0){
        throw new Error('The pack did not contain any Emotecraft emote files.')
    }

    const previous = readJson(inventoryPath, { files: [] })
    const nextInventory = {
        schemaVersion: 1,
        packId: 'astervale',
        version,
        minecraftVersion: '1.21.4',
        loader: 'neoforge-21.4.157',
        generatedAt: new Date().toISOString(),
        sourceProfile: path.basename(profile),
        files: inventory.sort((a, b) => a.path.localeCompare(b.path, 'ko'))
    }
    const diff = diffInventories(previous, nextInventory)

    createZip(packRoot, zipPath)
    const zipSize = fs.statSync(zipPath).size
    const zipSha256 = hashFile(zipPath)

    manifest.version = version
    manifest.fileName = fileName
    manifest.url = `https://github.com/Katozarasi/KTZ-Launcher/releases/download/astervale-client-pack-${version}/${fileName}`
    manifest.size = zipSize
    manifest.sha256 = zipSha256
    manifest.livePatch = null

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    fs.writeFileSync(inventoryPath, JSON.stringify(nextInventory, null, 2) + '\n', 'utf8')

    console.log(`Profile: ${profile}`)
    console.log(`Client mods: ${modFiles.length}`)
    console.log(`Emotecraft emotes: ${emoteFiles.length}`)
    console.log(`Managed files: ${inventory.length}`)
    printDiff(diff)
    console.log(`ZIP: ${zipPath}`)
    console.log(`SIZE: ${zipSize}`)
    console.log(`SHA256: ${zipSha256}`)
}

try {
    main()
} catch(err) {
    console.error(err.stack || err.message)
    process.exitCode = 1
}
