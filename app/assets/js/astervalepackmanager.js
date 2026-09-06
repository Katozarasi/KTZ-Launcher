const child_process = require('child_process')
const crypto = require('crypto')
const fs = require('fs-extra')
const got = require('got')
const path = require('path')
const semver = require('semver')
const { pipeline } = require('stream')
const { promisify } = require('util')

const ConfigManager = require('./configmanager')

const MANIFEST_URL = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/docs/packs/astervale.json'
const INVENTORY_URL = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/docs/packs/astervale-files.json'
const SERVER_ID = 'astervale'
const STRICT_MANAGED_DIRS = ['mods']
const MERGED_MANAGED_DIRS = ['config', 'resourcepacks', 'emotes', 'shaderpacks']
const MANAGED_DIRS = [...STRICT_MANAGED_DIRS, ...MERGED_MANAGED_DIRS]
// These settings belong to each player and must survive every full pack update.
// Keep this list narrow: managed defaults should continue to be replaced normally.
const USER_PRESERVED_PATHS = Object.freeze([
    'config/voicechat',
    'config/pastelpocket-client.properties'
])
const pipelineAsync = promisify(pipeline)

const FALLBACK_MANIFEST = {
    schemaVersion: 1,
    packId: SERVER_ID,
    version: '1.3.0',
    minecraftVersion: '1.21.4',
    loader: {
        type: 'neoforge',
        version: '21.4.157'
    },
    fileName: 'astervale-client-pack-1.3.0.zip',
    url: 'https://github.com/Katozarasi/KTZ-Launcher/releases/download/astervale-client-pack-1.3.0/astervale-client-pack-1.3.0.zip',
    minimumLauncherVersion: '3.3.3',
    sha256: '6d2c4a9c81f24c44be34becf7ed06b93daacc40abf5bf764a26062fb31f35341',
    size: 376871978,
    resourcePacks: [
        { file: 'AddCook-pack.zip', incompatible: true },
        { file: 'BorderLess Glass v1.zip', incompatible: false },
        { file: 'Better-Leaves-9.5.zip', incompatible: false }
    ],
    shaderPacks: [
        { file: '에스텔서버 쉐이더.zip', optionsFile: '에스텔서버 쉐이더.zip.txt', enabled: true }
    ],
    changelog: ['에스터베일 전용 쉐이더팩 자동 설치', '메뉴 배경 흐림 항상 꺼짐', '에스터베일 클라이언트 모드 갱신']
}

function setStatus(message, percent = null){
    try {
        if(typeof globalThis.ktzSetLaunchStatus === 'function'){
            globalThis.ktzSetLaunchStatus(message, percent)
        }
    } catch(_err) {
        // The launch status UI is optional while the renderer initializes.
    }
}

function quotePowerShell(value){
    return '\'' + String(value).replace(/'/g, '\'\'') + '\''
}

function runPowerShell(command){
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
            {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        )
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', data => { stdout += data })
        child.stderr.on('data', data => { stderr += data })
        child.once('error', reject)
        child.once('close', code => {
            if(code === 0){
                resolve(stdout)
            } else {
                reject(new Error((stderr || stdout || 'PowerShell command failed').trim()))
            }
        })
    })
}

function formatBytes(bytes){
    if(!Number.isFinite(bytes) || bytes <= 0){
        return '0 MB'
    }
    return (bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1) + ' MB'
}

async function downloadUrl(url, destination, label){
    const stream = got.stream(url, {
        retry: { limit: 2 },
        timeout: { request: 30 * 60 * 1000 }
    })
    stream.on('downloadProgress', progress => {
        const percent = Number.isFinite(progress.percent) ? Math.round(progress.percent * 80) : null
        const total = progress.total != null ? ` / ${formatBytes(progress.total)}` : ''
        setStatus(`${label} ${formatBytes(progress.transferred)}${total}`, percent)
    })
    await pipelineAsync(stream, fs.createWriteStream(destination))
}

function packRoot(){
    return path.join(ConfigManager.getCommonDirectory(), 'packs', SERVER_ID)
}

function gameDirectory(){
    return path.join(ConfigManager.getInstanceDirectory(), SERVER_ID)
}

function manifestCachePath(){
    return path.join(packRoot(), 'manifest.json')
}

function inventoryCachePath(version){
    return path.join(packRoot(), 'inventories', String(version) + '.json')
}

function statePath(){
    return path.join(gameDirectory(), '.ktz-pack-state.json')
}

function normalizeManagedRelativePath(value){
    const input = String(value || '').trim().replaceAll('\\', '/')
    if(input.length === 0 || input.startsWith('/') || /^[a-z]:/i.test(input)){
        throw new Error('Aster Vale live patch contains an invalid path: ' + input)
    }

    const normalized = path.posix.normalize(input)
    const segments = normalized.split('/').filter(Boolean)
    if(normalized === '.' || segments.length < 2 || segments.includes('..') || !MANAGED_DIRS.includes(segments[0])){
        throw new Error('Aster Vale live patch path must stay inside a managed folder: ' + input)
    }

    return segments.join('/')
}

function normalizeManagedFileList(values){
    if(!Array.isArray(values)){
        return []
    }
    return Array.from(new Set(values.map(value => {
        const raw = typeof value === 'string' ? value : value?.path
        return normalizeManagedRelativePath(raw)
    }).filter(value => !isUserPreservedPath(value)))).sort((a, b) => a.localeCompare(b, 'ko'))
}

function isUserPreservedPath(relativePath){
    const normalized = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    return USER_PRESERVED_PATHS.some(preserved =>
        normalized === preserved || normalized.startsWith(preserved + '/')
    )
}

function normalizeLivePatch(value){
    if(value == null){
        return null
    }
    if(typeof value !== 'object'){
        throw new Error('Aster Vale live patch is not an object.')
    }

    const revision = Number(value.revision)
    if(!Number.isSafeInteger(revision) || revision < 1){
        throw new Error('Aster Vale live patch revision must be a positive integer.')
    }

    const remove = Array.from(new Set((Array.isArray(value.remove) ? value.remove : []).map(normalizeManagedRelativePath)))
    const files = (Array.isArray(value.files) ? value.files : []).map(item => {
        if(item == null || typeof item !== 'object'){
            throw new Error('Aster Vale live patch file entry is not an object.')
        }

        const normalized = {
            path: normalizeManagedRelativePath(item.path),
            url: String(item.url || '').trim(),
            sha256: String(item.sha256 || '').trim().toLowerCase(),
            size: Number.isFinite(Number(item.size)) && Number(item.size) > 0 ? Number(item.size) : null
        }
        if(!/^https:\/\//i.test(normalized.url)){
            throw new Error('Aster Vale live patch file has an invalid download URL: ' + normalized.path)
        }
        if(!/^[a-f0-9]{64}$/.test(normalized.sha256) || normalized.size == null){
            throw new Error('Aster Vale live patch file requires exact size and SHA-256: ' + normalized.path)
        }
        return normalized
    })
    const protectedPath = [...remove, ...files.map(item => item.path)].find(isUserPreservedPath)
    if(protectedPath != null){
        throw new Error('Aster Vale live patch cannot replace player-owned settings: ' + protectedPath)
    }
    if(new Set(files.map(item => item.path)).size !== files.length){
        throw new Error('Aster Vale live patch contains duplicate file paths.')
    }

    return { revision, remove, files }
}

function normalizeManifest(value){
    if(value == null || typeof value !== 'object'){
        throw new Error('Aster Vale pack manifest is not an object.')
    }

    const manifest = Object.assign({}, FALLBACK_MANIFEST, value)
    manifest.loader = Object.assign({}, FALLBACK_MANIFEST.loader, value.loader || {})

    if(manifest.packId !== SERVER_ID){
        throw new Error('Unexpected Aster Vale pack id: ' + manifest.packId)
    }
    if(typeof manifest.version !== 'string' || manifest.version.trim().length === 0){
        throw new Error('Aster Vale pack manifest is missing version.')
    }
    if(typeof manifest.fileName !== 'string' || manifest.fileName.trim().length === 0){
        throw new Error('Aster Vale pack manifest is missing fileName.')
    }
    if(typeof manifest.url !== 'string' || !/^https:\/\//i.test(manifest.url)){
        throw new Error('Aster Vale pack manifest has an invalid download URL.')
    }

    manifest.version = manifest.version.trim()
    manifest.fileName = manifest.fileName.trim()
    manifest.sha256 = String(manifest.sha256 || '').trim().toLowerCase()
    manifest.size = Number.isFinite(Number(manifest.size)) && Number(manifest.size) > 0
        ? Number(manifest.size)
        : null
    manifest.resourcePacks = (Array.isArray(value.resourcePacks) ? value.resourcePacks : [])
        .map(item => typeof item === 'string' ? { file: item, incompatible: false } : item)
        .map(item => ({
            file: String(item?.file || '').trim(),
            incompatible: item?.incompatible === true
        }))
        .filter(item => item.file.length > 0 && path.basename(item.file) === item.file)
    manifest.shaderPacks = (Array.isArray(value.shaderPacks) ? value.shaderPacks : [])
        .map(item => typeof item === 'string' ? { file: item, optionsFile: `${item}.txt`, enabled: false } : item)
        .map(item => ({
            file: String(item?.file || '').trim(),
            optionsFile: String(item?.optionsFile || '').trim(),
            enabled: item?.enabled === true
        }))
        .filter(item =>
            item.file.toLowerCase().endsWith('.zip') &&
            path.basename(item.file) === item.file &&
            (item.optionsFile.length === 0 || path.basename(item.optionsFile) === item.optionsFile)
        )
    manifest.livePatch = normalizeLivePatch(value.livePatch)

    return manifest
}

function readJsonIfValid(file){
    try {
        if(!fs.existsSync(file)){
            return null
        }
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch(_err) {
        return null
    }
}

async function loadRemoteManifest(){
    const root = packRoot()
    const cached = manifestCachePath()
    const partial = cached + '.part'
    fs.ensureDirSync(root)

    try {
        const separator = MANIFEST_URL.includes('?') ? '&' : '?'
        const cacheBustedUrl = MANIFEST_URL + separator + 't=' + Date.now()
        const body = await got(cacheBustedUrl, {
            retry: { limit: 2 },
            timeout: { request: 15000 }
        }).text()
        fs.writeFileSync(partial, body, 'utf8')
        const manifest = normalizeManifest(JSON.parse(fs.readFileSync(partial, 'utf8')))
        fs.moveSync(partial, cached, { overwrite: true })
        console.log('[KTZ AsterVale] Loaded remote pack manifest:', manifest.version)
        return manifest
    } catch(err) {
        fs.removeSync(partial)
        console.warn('[KTZ AsterVale] Unable to refresh remote pack manifest. Trying cache.', err.message)

        const cachedManifest = readJsonIfValid(cached)
        if(cachedManifest != null){
            try {
                const manifest = normalizeManifest(cachedManifest)
                console.log('[KTZ AsterVale] Using cached pack manifest:', manifest.version)
                return manifest
            } catch(_err) {
                // Ignore an invalid cache and use the built-in fallback manifest.
            }
        }

        console.warn('[KTZ AsterVale] Using built-in fallback pack manifest:', FALLBACK_MANIFEST.version)
        return normalizeManifest(FALLBACK_MANIFEST)
    }
}

function normalizeInventory(value, expectedVersion){
    if(value == null || typeof value !== 'object' || value.packId !== SERVER_ID){
        throw new Error('Aster Vale managed file inventory is invalid.')
    }
    if(String(value.version || '') !== String(expectedVersion)){
        throw new Error('Aster Vale managed file inventory version does not match the installed pack.')
    }
    const managedFiles = normalizeManagedFileList(value.files)
    if(managedFiles.length === 0){
        throw new Error('Aster Vale managed file inventory is empty.')
    }
    return managedFiles
}

async function loadManagedInventory(version){
    const cached = inventoryCachePath(version)
    const partial = cached + '.part'
    fs.ensureDirSync(path.dirname(cached))

    try {
        const separator = INVENTORY_URL.includes('?') ? '&' : '?'
        const body = await got(INVENTORY_URL + separator + 't=' + Date.now(), {
            retry: { limit: 2 },
            timeout: { request: 15000 }
        }).text()
        fs.writeFileSync(partial, body, 'utf8')
        const inventory = JSON.parse(fs.readFileSync(partial, 'utf8'))
        const managedFiles = normalizeInventory(inventory, version)
        fs.moveSync(partial, cached, { overwrite: true })
        return managedFiles
    } catch(err) {
        fs.removeSync(partial)
        const cachedInventory = readJsonIfValid(cached)
        if(cachedInventory != null){
            try {
                return normalizeInventory(cachedInventory, version)
            } catch(_err) {
                // Ignore an invalid cache and preserve all non-mod files conservatively.
            }
        }
        console.warn('[KTZ AsterVale] Managed file inventory unavailable:', err.message)
        return []
    }
}

function launcherVersion(){
    try {
        return require('@electron/remote').app.getVersion()
    } catch(_err) {
        return '0.0.0'
    }
}

function enforceMinimumLauncherVersion(manifest){
    const minimum = manifest.minimumLauncherVersion
    if(typeof minimum !== 'string' || !semver.valid(minimum)){
        return
    }

    const current = launcherVersion()
    if(semver.valid(current) && semver.lt(current, minimum)){
        throw new Error(
            '에스터베일 클라이언트팩 ' + manifest.version + '에는 KTZ Launcher ' + minimum + ' 이상이 필요해요. ' +
            '현재 런처 버전은 ' + current + '이에요.'
        )
    }
}

function countFiles(dir, predicate = null){
    if(!fs.existsSync(dir)){
        return 0
    }

    let total = 0
    for(const entry of fs.readdirSync(dir)){
        const full = path.join(dir, entry)
        let stat
        try {
            stat = fs.statSync(full)
        } catch(_err) {
            continue
        }

        if(stat.isDirectory()){
            total += countFiles(full, predicate)
        } else if(predicate == null || predicate(full)){
            total++
        }
    }
    return total
}

function collectManagedFiles(root){
    const files = []

    function visit(current, relativeRoot){
        if(!fs.existsSync(current)){
            return
        }
        for(const entry of fs.readdirSync(current, { withFileTypes: true })){
            const full = path.join(current, entry.name)
            const relative = relativeRoot.length > 0 ? relativeRoot + '/' + entry.name : entry.name
            if(entry.isDirectory()){
                visit(full, relative)
            } else if(entry.isFile() && entry.name !== '.gitkeep'){
                files.push(relative.replaceAll('\\', '/'))
            }
        }
    }

    for(const name of MANAGED_DIRS){
        visit(path.join(root, name), name)
    }
    return normalizeManagedFileList(files)
}

function payloadCounts(root){
    return {
        mods: countFiles(path.join(root, 'mods'), file => {
            const lower = file.toLowerCase()
            return lower.endsWith('.jar') || lower.endsWith('.zip')
        }),
        config: countFiles(path.join(root, 'config'), file => path.basename(file) !== '.gitkeep'),
        resourcepacks: countFiles(path.join(root, 'resourcepacks'), file => file.toLowerCase().endsWith('.zip')),
        emotes: countFiles(path.join(root, 'emotes'), file => file.toLowerCase().endsWith('.emotecraft')),
        shaderpacks: countFiles(path.join(root, 'shaderpacks'), file => file.toLowerCase().endsWith('.zip'))
    }
}

function hasValidPayload(root, manifest = null){
    const counts = payloadCounts(root)
    console.log(
        '[KTZ AsterVale] Payload check: mods=' + counts.mods +
        ', config=' + counts.config +
        ', resourcepacks=' + counts.resourcepacks +
        ', emotes=' + counts.emotes +
        ', shaderpacks=' + counts.shaderpacks
    )
    const requiresShaderpacks = Array.isArray(manifest?.shaderPacks) && manifest.shaderPacks.length > 0
    return counts.mods > 0 && counts.config > 0 && counts.resourcepacks > 0 && counts.emotes > 0 &&
        (!requiresShaderpacks || counts.shaderpacks > 0)
}

function readInstalledState(){
    return readJsonIfValid(statePath())
}

function writeInstalledState(manifest, livePatchRevision = 0, managedFiles = [], backupPath = null){
    const state = {
        schemaVersion: 2,
        packId: SERVER_ID,
        installedVersion: manifest.version,
        fileName: manifest.fileName,
        sha256: manifest.sha256 || null,
        livePatchRevision,
        managedFiles: normalizeManagedFileList(managedFiles),
        backupPath,
        installedAt: new Date().toISOString()
    }
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n', 'utf8')
    return state
}

async function ensureInstalledManagedInventory(manifest, state){
    if(state == null || state.installedVersion !== manifest.version || normalizeManagedFileList(state.managedFiles).length > 0){
        return state
    }

    const managedFiles = await loadManagedInventory(manifest.version)
    if(managedFiles.length === 0){
        return state
    }

    state.schemaVersion = 2
    state.managedFiles = managedFiles
    state.inventoryRecordedAt = new Date().toISOString()
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n', 'utf8')
    console.log('[KTZ AsterVale] Recorded managed file inventory:', managedFiles.length)
    return state
}

function sha256(file){
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(file)
        stream.on('data', chunk => hash.update(chunk))
        stream.once('error', reject)
        stream.once('end', () => resolve(hash.digest('hex')))
    })
}

async function verifyDownload(file, manifest){
    if(!fs.existsSync(file)){
        throw new Error('Aster Vale client pack download is missing: ' + file)
    }

    const size = fs.statSync(file).size
    if(manifest.size != null && size !== manifest.size){
        throw new Error('Aster Vale client pack size mismatch. Expected ' + manifest.size + ' bytes, received ' + size + ' bytes.')
    }

    if(manifest.sha256.length > 0){
        setStatus('에스터베일 클라이언트팩을 검사하고 있어요...')
        const actual = await sha256(file)
        if(actual !== manifest.sha256){
            throw new Error('Aster Vale client pack SHA-256 mismatch.')
        }
    }
}

function managedPath(root, relativePath){
    const resolvedRoot = path.resolve(root)
    const resolved = path.resolve(root, ...relativePath.split('/'))
    if(!resolved.startsWith(resolvedRoot + path.sep)){
        throw new Error('Aster Vale live patch path escaped its managed root: ' + relativePath)
    }
    return resolved
}

async function prepareLivePatchFiles(patch){
    const patchRoot = path.join(packRoot(), 'live-patches', String(patch.revision))
    const stagingRoot = path.join(patchRoot, 'staging')
    fs.removeSync(stagingRoot)
    fs.ensureDirSync(stagingRoot)

    for(const item of patch.files){
        const destination = managedPath(stagingRoot, item.path)
        const partial = destination + '.part'
        fs.ensureDirSync(path.dirname(destination))

        console.log('[KTZ AsterVale] Downloading live patch file:', item.path)
        await downloadUrl(item.url, partial, '에스터베일 패치 다운로드 중...')
        await verifyDownload(partial, item)
        fs.moveSync(partial, destination, { overwrite: true })
    }

    return { patchRoot, stagingRoot }
}

function markLivePatchApplied(manifest, patch){
    const state = readInstalledState()
    if(state == null || state.installedVersion !== manifest.version){
        throw new Error('Aster Vale live patch cannot update an unknown pack state.')
    }

    state.livePatchRevision = patch.revision
    if(Array.isArray(state.managedFiles)){
        const managedFiles = new Set(normalizeManagedFileList(state.managedFiles))
        for(const relativePath of patch.remove){
            managedFiles.delete(relativePath)
        }
        for(const item of patch.files){
            managedFiles.add(item.path)
        }
        state.managedFiles = Array.from(managedFiles).sort((a, b) => a.localeCompare(b, 'ko'))
    }
    state.lastPatchedAt = new Date().toISOString()
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

async function applyLivePatch(manifest){
    const patch = manifest.livePatch
    if(patch == null){
        return false
    }

    const installed = readInstalledState()
    const currentRevision = Number(installed?.livePatchRevision || 0)
    if(currentRevision >= patch.revision){
        return false
    }

    setStatus('에스터베일 실시간 패치를 적용하고 있어요...')
    console.log('[KTZ AsterVale] Applying live patch revision:', patch.revision)

    const { patchRoot, stagingRoot } = await prepareLivePatchFiles(patch)
    const backupRoot = path.join(patchRoot, 'backup')
    const touched = Array.from(new Set([...patch.remove, ...patch.files.map(item => item.path)]))
    const backups = []
    const installedFiles = []

    fs.removeSync(backupRoot)
    fs.ensureDirSync(backupRoot)

    try {
        for(const relativePath of touched){
            const target = managedPath(gameDirectory(), relativePath)
            if(fs.existsSync(target)){
                const backup = managedPath(backupRoot, relativePath)
                fs.ensureDirSync(path.dirname(backup))
                fs.moveSync(target, backup, { overwrite: true })
                backups.push({ target, backup })
                console.log('[KTZ AsterVale] Live patch removed or replaced:', relativePath)
            }
        }

        for(const item of patch.files){
            const source = managedPath(stagingRoot, item.path)
            const target = managedPath(gameDirectory(), item.path)
            fs.ensureDirSync(path.dirname(target))
            fs.moveSync(source, target, { overwrite: true })
            installedFiles.push(target)
            console.log('[KTZ AsterVale] Live patch installed:', item.path)
        }

        markLivePatchApplied(manifest, patch)
        fs.removeSync(patchRoot)
        console.log('[KTZ AsterVale] Live patch complete:', patch.revision)
        return true
    } catch(err) {
        console.error('[KTZ AsterVale] Live patch failed. Restoring previous files.', err)
        for(const target of installedFiles){
            fs.removeSync(target)
        }
        for(const item of backups.reverse()){
            if(fs.existsSync(item.backup)){
                fs.ensureDirSync(path.dirname(item.target))
                fs.moveSync(item.backup, item.target, { overwrite: true })
            }
        }
        throw err
    }
}

async function downloadPack(manifest){
    const downloadDir = path.join(packRoot(), 'downloads', manifest.version)
    const destination = path.join(downloadDir, manifest.fileName)
    const partial = destination + '.part'
    fs.ensureDirSync(downloadDir)

    if(fs.existsSync(destination)){
        try {
            await verifyDownload(destination, manifest)
            console.log('[KTZ AsterVale] Reusing cached client pack:', destination)
            return destination
        } catch(err) {
            console.warn('[KTZ AsterVale] Cached client pack is invalid. Downloading again.', err.message)
            fs.removeSync(destination)
        }
    }

    fs.removeSync(partial)
    setStatus('에스터베일 클라이언트팩을 다운로드하고 있어요...')
    console.log('[KTZ AsterVale] Downloading client pack ' + manifest.version + ':', manifest.url)

    await downloadUrl(manifest.url, partial, '에스터베일 클라이언트팩 다운로드 중...')
    fs.moveSync(partial, destination, { overwrite: true })
    await verifyDownload(destination, manifest)
    return destination
}

async function extractPack(zipPath, manifest){
    const extractDir = path.join(packRoot(), 'staging', manifest.version, 'extracted')
    fs.removeSync(extractDir)
    fs.ensureDirSync(extractDir)

    setStatus('에스터베일 클라이언트팩의 압축을 풀고 있어요...', 82)
    console.log('[KTZ AsterVale] Extracting client pack:', extractDir)

    const command = 'Expand-Archive -LiteralPath ' + quotePowerShell(zipPath) +
        ' -DestinationPath ' + quotePowerShell(extractDir) + ' -Force'
    await runPowerShell(command)
    return extractDir
}

function removeGitkeepFiles(dir){
    if(!fs.existsSync(dir)){
        return
    }

    for(const entry of fs.readdirSync(dir)){
        const full = path.join(dir, entry)
        const stat = fs.statSync(full)
        if(stat.isDirectory()){
            removeGitkeepFiles(full)
        } else if(entry === '.gitkeep'){
            fs.removeSync(full)
        }
    }
}

function collectDirectories(rootDir){
    const dirs = []
    if(!fs.existsSync(rootDir)){
        return dirs
    }

    const stack = [rootDir]
    while(stack.length > 0){
        const current = stack.pop()
        dirs.push(current)
        for(const entry of fs.readdirSync(current)){
            const full = path.join(current, entry)
            try {
                if(fs.statSync(full).isDirectory()){
                    stack.push(full)
                }
            } catch(_err) {
                // Ignore unreadable entries while searching an extracted pack.
            }
        }
    }
    return dirs
}

function scorePayloadDir(dir, type){
    const root = path.join(dir)
    switch(type){
        case 'mods':
            return countFiles(root, file => {
                const lower = file.toLowerCase()
                return lower.endsWith('.jar') || lower.endsWith('.zip')
            })
        case 'config':
            return countFiles(root, file => path.basename(file) !== '.gitkeep')
        case 'datapacks':
            return countFiles(root, file => {
                const lower = file.toLowerCase()
                return lower.endsWith('.zip') || path.basename(lower) === 'pack.mcmeta'
            })
        case 'resourcepacks':
            return countFiles(root, file => file.toLowerCase().endsWith('.zip'))
        case 'emotes':
            return countFiles(root, file => file.toLowerCase().endsWith('.emotecraft'))
        case 'shaderpacks':
            return countFiles(root, file => file.toLowerCase().endsWith('.zip'))
        default:
            return 0
    }
}

function findPayloadDir(extractDir, type){
    const expectedNames = type === 'datapacks' ? ['datapacks', 'datapack'] : [type]
    const directCandidates = []

    for(const name of expectedNames){
        directCandidates.push(path.join(extractDir, name))
        directCandidates.push(path.join(extractDir, 'build', 'astervale-pack', name))
        directCandidates.push(path.join(extractDir, 'astervale-pack', name))
        directCandidates.push(path.join(extractDir, 'files', name, SERVER_ID))
    }

    for(const candidate of directCandidates){
        if(scorePayloadDir(candidate, type) > 0){
            console.log('[KTZ AsterVale] Selected ' + type + ' payload source:', candidate)
            return candidate
        }
    }

    let best = null
    let bestScore = 0
    for(const dir of collectDirectories(extractDir)){
        const base = path.basename(dir).toLowerCase()
        const parent = path.basename(path.dirname(dir)).toLowerCase()
        const normalized = dir.toLowerCase().replaceAll('\\', '/')
        const looksLikePayload = expectedNames.includes(base) ||
            (base === SERVER_ID && expectedNames.includes(parent)) ||
            expectedNames.some(name => normalized.endsWith('/files/' + name + '/' + SERVER_ID))

        if(!looksLikePayload){
            continue
        }

        const score = scorePayloadDir(dir, type)
        if(score > bestScore){
            best = dir
            bestScore = score
        }
    }

    if(best != null){
        console.log('[KTZ AsterVale] Selected ' + type + ' payload source:', best, 'files=' + bestScore)
        return best
    }

    throw new Error('Aster Vale client pack does not contain a non-empty ' + type + ' folder.')
}

async function createStagingInstance(extractDir, manifest){
    const stagingRoot = path.join(packRoot(), 'staging', manifest.version, 'instance')
    fs.removeSync(stagingRoot)
    fs.ensureDirSync(stagingRoot)

    setStatus('에스터베일 모드와 설정을 준비하고 있어요...', 90)

    for(const type of MANAGED_DIRS){
        const source = findPayloadDir(extractDir, type)
        const target = path.join(stagingRoot, type)
        await fs.copy(source, target, { overwrite: true, errorOnExist: false })
        removeGitkeepFiles(target)
    }

    if(!hasValidPayload(stagingRoot, manifest)){
        throw new Error('Aster Vale client pack staging payload is incomplete.')
    }

    return stagingRoot
}

function removePreviousMergedManagedFiles(gameDir, managedFiles, managedDir){
    for(const relativePath of normalizeManagedFileList(managedFiles)){
        const topLevel = relativePath.split('/')[0]
        if(topLevel !== managedDir || !MERGED_MANAGED_DIRS.includes(topLevel) || isUserPreservedPath(relativePath)){
            continue
        }
        fs.removeSync(managedPath(gameDir, relativePath))
    }
}

function retainLatestBackup(backupRoot, previousVersion){
    const backupParent = path.dirname(backupRoot)
    if(!fs.existsSync(backupRoot) || fs.readdirSync(backupRoot).length === 0){
        fs.removeSync(backupRoot)
        return null
    }

    fs.writeFileSync(path.join(backupRoot, '.ktz-backup.json'), JSON.stringify({
        schemaVersion: 1,
        packId: SERVER_ID,
        previousVersion: previousVersion || null,
        createdAt: new Date().toISOString()
    }, null, 2) + '\n', 'utf8')

    for(const entry of fs.readdirSync(backupParent, { withFileTypes: true })){
        const candidate = path.join(backupParent, entry.name)
        if(entry.isDirectory() && path.resolve(candidate) !== path.resolve(backupRoot)){
            fs.removeSync(candidate)
        }
    }
    return path.basename(backupRoot)
}

function installStagedPayload(stagingRoot, manifest){
    const gameDir = gameDirectory()
    const backupRoot = path.join(packRoot(), 'backup', Date.now().toString())
    const movedToBackup = []
    const installedTargets = []
    const previousState = readInstalledState()
    const previousManagedFiles = normalizeManagedFileList(previousState?.managedFiles)
    const nextManagedFiles = collectManagedFiles(stagingRoot)

    fs.ensureDirSync(gameDir)
    fs.ensureDirSync(backupRoot)
    setStatus('에스터베일 클라이언트팩을 적용하고 있어요...', 96)

    try {
        for(const name of MANAGED_DIRS){
            const target = path.join(gameDir, name)
            if(fs.existsSync(target)){
                const backup = path.join(backupRoot, name)
                fs.moveSync(target, backup, { overwrite: true })
                movedToBackup.push({ target, backup })
            }
        }

        for(const name of STRICT_MANAGED_DIRS){
            const source = path.join(stagingRoot, name)
            const target = path.join(gameDir, name)
            fs.moveSync(source, target, { overwrite: true })
            installedTargets.push(target)
        }

        for(const name of MERGED_MANAGED_DIRS){
            const source = path.join(stagingRoot, name)
            const target = path.join(gameDir, name)
            const backup = path.join(backupRoot, name)
            if(fs.existsSync(backup)){
                fs.copySync(backup, target, { overwrite: true, errorOnExist: false })
            } else {
                fs.ensureDirSync(target)
            }
            installedTargets.push(target)
            removePreviousMergedManagedFiles(gameDir, previousManagedFiles, name)
            fs.copySync(source, target, { overwrite: true, errorOnExist: false })
        }

        for(const relativePath of USER_PRESERVED_PATHS){
            const source = managedPath(backupRoot, relativePath)
            if(!fs.existsSync(source)){
                continue
            }
            const target = managedPath(gameDir, relativePath)
            fs.ensureDirSync(path.dirname(target))
            fs.copySync(source, target, { overwrite: true, errorOnExist: false })
            console.log('[KTZ AsterVale] Preserved player settings:', relativePath)
        }

        if(!hasValidPayload(gameDir, manifest)){
            throw new Error('Aster Vale client pack installation validation failed.')
        }

        enableManagedResourcePacks(manifest)
        applyManagedClientPreferences(manifest)
        const backupId = retainLatestBackup(backupRoot, previousState?.installedVersion)
        writeInstalledState(manifest, 0, nextManagedFiles, backupId)
        console.log('[KTZ AsterVale] Client pack installation complete:', manifest.version)
    } catch(err) {
        console.error('[KTZ AsterVale] Installation failed. Restoring previous client pack.', err)

        for(const target of installedTargets.reverse()){
            fs.removeSync(target)
        }
        for(const item of movedToBackup.reverse()){
            if(fs.existsSync(item.backup)){
                fs.moveSync(item.backup, item.target, { overwrite: true })
            }
        }
        fs.removeSync(backupRoot)
        throw err
    }
}

function enableManagedResourcePacks(manifest){
    if(manifest.resourcePacks.length === 0){
        return
    }

    const optionsFile = path.join(gameDirectory(), 'options.txt')
    const existing = fs.existsSync(optionsFile) ? fs.readFileSync(optionsFile, 'utf8') : ''
    let lines = existing.length > 0 ? existing.replaceAll('\r\n', '\n').split('\n') : []

    function appendValues(key, values){
        const prefix = key + ':'
        const index = lines.findIndex(line => line.startsWith(prefix))
        let current = []
        if(index >= 0){
            try {
                current = JSON.parse(lines[index].slice(prefix.length))
            } catch(_err) {
                current = []
            }
        }
        const merged = Array.from(new Set([...current, ...values]))
        const line = prefix + JSON.stringify(merged)
        if(index >= 0){
            lines[index] = line
        } else {
            lines.push(line)
        }
    }

    const enabled = manifest.resourcePacks.map(item => `file/${item.file}`)
    const incompatible = manifest.resourcePacks
        .filter(item => item.incompatible)
        .map(item => `file/${item.file}`)
    appendValues('resourcePacks', enabled)
    if(incompatible.length > 0){
        appendValues('incompatibleResourcePacks', incompatible)
    }

    lines = lines.filter((line, index) => line.length > 0 || index < lines.length - 1)
    fs.writeFileSync(optionsFile, lines.join('\n') + '\n', 'utf8')
    console.log('[KTZ AsterVale] Enabled managed resource packs:', enabled.join(', '))
}

function upsertOption(file, separator, key, value){
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    let lines = existing.length > 0 ? existing.replaceAll('\r\n', '\n').split('\n') : []
    const prefix = key + separator
    const index = lines.findIndex(line => line.startsWith(prefix))
    const next = prefix + value
    if(index >= 0){
        lines[index] = next
    } else {
        lines.push(next)
    }
    lines = lines.filter((line, lineIndex) => line.length > 0 || lineIndex < lines.length - 1)
    fs.ensureDirSync(path.dirname(file))
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8')
}

function javaPropertiesValue(value){
    return String(value)
        .replaceAll('\\', '\\\\')
        .replace(/[^\x20-\x7e]/g, character =>
            '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()
        )
}

function applyManagedClientPreferences(manifest){
    const gameDir = gameDirectory()
    upsertOption(path.join(gameDir, 'options.txt'), ':', 'menuBackgroundBlurriness', '0')
    console.log('[KTZ AsterVale] Forced menu background blur off.')

    const selected = manifest.shaderPacks.find(item => item.enabled) || manifest.shaderPacks[0]
    if(selected == null){
        return
    }

    const shaderFile = path.join(gameDir, 'shaderpacks', selected.file)
    if(!fs.existsSync(shaderFile)){
        throw new Error('Aster Vale managed shaderpack is missing: ' + selected.file)
    }
    if(selected.optionsFile.length > 0 && !fs.existsSync(path.join(gameDir, 'shaderpacks', selected.optionsFile))){
        throw new Error('Aster Vale managed shaderpack options are missing: ' + selected.optionsFile)
    }

    const irisOptions = path.join(gameDir, 'config', 'iris.properties')
    upsertOption(irisOptions, '=', 'enableShaders', 'true')
    upsertOption(irisOptions, '=', 'shaderPack', javaPropertiesValue(selected.file))
    console.log('[KTZ AsterVale] Selected managed shaderpack:', selected.file)
}

async function prepare(serverId){
    if(serverId !== SERVER_ID){
        return null
    }

    setStatus('에스터베일 클라이언트팩 업데이트를 확인하고 있어요...')
    const manifest = await loadRemoteManifest()
    enforceMinimumLauncherVersion(manifest)

    const installed = readInstalledState()

    if(installed?.installedVersion === manifest.version && hasValidPayload(gameDirectory(), manifest)){
        await ensureInstalledManagedInventory(manifest, installed)
        console.log('[KTZ AsterVale] Client pack is up to date:', manifest.version)
        await applyLivePatch(manifest)
        applyManagedClientPreferences(manifest)
        return manifest
    }

    console.log(
        '[KTZ AsterVale] Client pack update required. Installed=' +
        (installed?.installedVersion || 'none') + ', Remote=' + manifest.version
    )

    const zipPath = await downloadPack(manifest)
    const extractDir = await extractPack(zipPath, manifest)
    const stagingRoot = await createStagingInstance(extractDir, manifest)
    installStagedPayload(stagingRoot, manifest)
    await applyLivePatch(manifest)
    applyManagedClientPreferences(manifest)

    fs.removeSync(path.join(packRoot(), 'staging', manifest.version))
    return manifest
}

function reset(){
    fs.removeSync(statePath())
    fs.removeSync(path.join(packRoot(), 'staging'))
    fs.removeSync(path.join(packRoot(), 'live-patches'))
}

function installedVersion(){
    return readInstalledState()?.installedVersion || null
}

module.exports = {
    MANIFEST_URL,
    prepare,
    reset,
    installedVersion,
    hasValidPayload,
    USER_PRESERVED_PATHS
}

