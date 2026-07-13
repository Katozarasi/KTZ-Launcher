const child_process = require('child_process')
const fs = require('fs-extra')
const path = require('path')
const semver = require('semver')

const ConfigManager = require('./configmanager')

const MANIFEST_URL = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/docs/packs/toketmon.json'
const SERVER_ID = 'toketmon'
const MANAGED_DIRS = ['mods', 'config', 'datapacks', 'resourcepacks']

const FALLBACK_MANIFEST = {
    schemaVersion: 1,
    packId: SERVER_ID,
    version: '1.0.0',
    minecraftVersion: '1.21.1',
    loader: {
        type: 'fabric',
        version: '0.18.4'
    },
    fileName: 'toketmon-client-pack-v1.zip',
    url: 'https://github.com/Katozarasi/KTZ-Launcher/releases/download/toketmon-client-pack-v1/toketmon-client-pack-v1.zip',
    minimumLauncherVersion: '3.2.0',
    sha256: '',
    size: null,
    changelog: []
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
    const result = child_process.spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        {
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 32 * 1024 * 1024
        }
    )

    if(result.status !== 0){
        throw new Error((result.stderr || result.stdout || 'PowerShell command failed').trim())
    }

    return result.stdout || ''
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

function statePath(){
    return path.join(gameDirectory(), '.ktz-pack-state.json')
}

function legacyMarkerPath(){
    return path.join(gameDirectory(), '.ktz-toketmon-client-pack-v1')
}

function normalizeManagedRelativePath(value){
    const input = String(value || '').trim().replaceAll('\\', '/')
    if(input.length === 0 || input.startsWith('/') || /^[a-z]:/i.test(input)){
        throw new Error('Toketmon live patch contains an invalid path: ' + input)
    }

    const normalized = path.posix.normalize(input)
    const segments = normalized.split('/').filter(Boolean)
    if(normalized === '.' || segments.length < 2 || segments.includes('..') || !MANAGED_DIRS.includes(segments[0])){
        throw new Error('Toketmon live patch path must stay inside a managed folder: ' + input)
    }

    return segments.join('/')
}

function normalizeLivePatch(value){
    if(value == null){
        return null
    }
    if(typeof value !== 'object'){
        throw new Error('Toketmon live patch is not an object.')
    }

    const revision = Number(value.revision)
    if(!Number.isSafeInteger(revision) || revision < 1){
        throw new Error('Toketmon live patch revision must be a positive integer.')
    }

    const remove = Array.from(new Set((Array.isArray(value.remove) ? value.remove : []).map(normalizeManagedRelativePath)))
    const files = (Array.isArray(value.files) ? value.files : []).map(item => {
        if(item == null || typeof item !== 'object'){
            throw new Error('Toketmon live patch file entry is not an object.')
        }

        const normalized = {
            path: normalizeManagedRelativePath(item.path),
            url: String(item.url || '').trim(),
            sha256: String(item.sha256 || '').trim().toLowerCase(),
            size: Number.isFinite(Number(item.size)) && Number(item.size) > 0 ? Number(item.size) : null
        }
        if(!/^https:\/\//i.test(normalized.url)){
            throw new Error('Toketmon live patch file has an invalid download URL: ' + normalized.path)
        }
        if(!/^[a-f0-9]{64}$/.test(normalized.sha256) || normalized.size == null){
            throw new Error('Toketmon live patch file requires exact size and SHA-256: ' + normalized.path)
        }
        return normalized
    })
    if(new Set(files.map(item => item.path)).size !== files.length){
        throw new Error('Toketmon live patch contains duplicate file paths.')
    }

    return { revision, remove, files }
}

function normalizeManifest(value){
    if(value == null || typeof value !== 'object'){
        throw new Error('Toketmon pack manifest is not an object.')
    }

    const manifest = Object.assign({}, FALLBACK_MANIFEST, value)
    manifest.loader = Object.assign({}, FALLBACK_MANIFEST.loader, value.loader || {})

    if(manifest.packId !== SERVER_ID){
        throw new Error('Unexpected Toketmon pack id: ' + manifest.packId)
    }
    if(typeof manifest.version !== 'string' || manifest.version.trim().length === 0){
        throw new Error('Toketmon pack manifest is missing version.')
    }
    if(typeof manifest.fileName !== 'string' || manifest.fileName.trim().length === 0){
        throw new Error('Toketmon pack manifest is missing fileName.')
    }
    if(typeof manifest.url !== 'string' || !/^https:\/\//i.test(manifest.url)){
        throw new Error('Toketmon pack manifest has an invalid download URL.')
    }

    manifest.version = manifest.version.trim()
    manifest.fileName = manifest.fileName.trim()
    manifest.sha256 = String(manifest.sha256 || '').trim().toLowerCase()
    manifest.size = Number.isFinite(Number(manifest.size)) && Number(manifest.size) > 0
        ? Number(manifest.size)
        : null
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

function loadRemoteManifest(){
    const root = packRoot()
    const cached = manifestCachePath()
    const partial = cached + '.part'
    fs.ensureDirSync(root)

    try {
        const separator = MANIFEST_URL.includes('?') ? '&' : '?'
        const cacheBustedUrl = MANIFEST_URL + separator + 't=' + Date.now()
        const command = '$ProgressPreference=\'SilentlyContinue\'; Invoke-WebRequest -UseBasicParsing -Uri ' +
            quotePowerShell(cacheBustedUrl) + ' -OutFile ' + quotePowerShell(partial)

        runPowerShell(command)
        const manifest = normalizeManifest(JSON.parse(fs.readFileSync(partial, 'utf8')))
        fs.moveSync(partial, cached, { overwrite: true })
        console.log('[KTZ Toketmon] Loaded remote pack manifest:', manifest.version)
        return manifest
    } catch(err) {
        fs.removeSync(partial)
        console.warn('[KTZ Toketmon] Unable to refresh remote pack manifest. Trying cache.', err.message)

        const cachedManifest = readJsonIfValid(cached)
        if(cachedManifest != null){
            try {
                const manifest = normalizeManifest(cachedManifest)
                console.log('[KTZ Toketmon] Using cached pack manifest:', manifest.version)
                return manifest
            } catch(_err) {
                // Ignore an invalid cache and use the built-in fallback manifest.
            }
        }

        console.warn('[KTZ Toketmon] Using built-in fallback pack manifest:', FALLBACK_MANIFEST.version)
        return normalizeManifest(FALLBACK_MANIFEST)
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
            '토켓몬 클라이언트팩 ' + manifest.version + '에는 KTZ Launcher ' + minimum + ' 이상이 필요해요. ' +
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

function payloadCounts(root){
    return {
        mods: countFiles(path.join(root, 'mods'), file => {
            const lower = file.toLowerCase()
            return lower.endsWith('.jar') || lower.endsWith('.zip')
        }),
        config: countFiles(path.join(root, 'config'), file => path.basename(file) !== '.gitkeep'),
        datapacks: countFiles(path.join(root, 'datapacks'), file => {
            const lower = file.toLowerCase()
            return lower.endsWith('.zip') || path.basename(lower) === 'pack.mcmeta'
        }),
        resourcepacks: countFiles(path.join(root, 'resourcepacks'), file => file.toLowerCase().endsWith('.zip'))
    }
}

function hasValidPayload(root){
    const counts = payloadCounts(root)
    console.log(
        '[KTZ Toketmon] Payload check: mods=' + counts.mods +
        ', config=' + counts.config +
        ', datapacks=' + counts.datapacks +
        ', resourcepacks=' + counts.resourcepacks
    )
    return counts.mods > 0 && counts.config > 0 && counts.datapacks > 0 && counts.resourcepacks > 0
}

function readInstalledState(){
    return readJsonIfValid(statePath())
}

function writeInstalledState(manifest, livePatchRevision = 0){
    const state = {
        schemaVersion: 1,
        packId: SERVER_ID,
        installedVersion: manifest.version,
        fileName: manifest.fileName,
        sha256: manifest.sha256 || null,
        livePatchRevision,
        installedAt: new Date().toISOString()
    }
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n', 'utf8')
    return state
}

function migrateLegacyInstall(){
    if(fs.existsSync(legacyMarkerPath()) && hasValidPayload(gameDirectory())){
        const state = writeInstalledState(FALLBACK_MANIFEST, 0)
        console.log('[KTZ Toketmon] Migrated legacy pack marker as its real version:', state.installedVersion)
        return state
    }
    return null
}

function sha256(file){
    const command = '(Get-FileHash -Algorithm SHA256 -LiteralPath ' + quotePowerShell(file) + ').Hash.ToLowerInvariant()'
    return runPowerShell(command).trim().toLowerCase()
}

function verifyDownload(file, manifest){
    if(!fs.existsSync(file)){
        throw new Error('Toketmon client pack download is missing: ' + file)
    }

    const size = fs.statSync(file).size
    if(manifest.size != null && size !== manifest.size){
        throw new Error('Toketmon client pack size mismatch. Expected ' + manifest.size + ' bytes, received ' + size + ' bytes.')
    }

    if(manifest.sha256.length > 0){
        setStatus('토켓몬 클라이언트팩을 검사하고 있어요...')
        const actual = sha256(file)
        if(actual !== manifest.sha256){
            throw new Error('Toketmon client pack SHA-256 mismatch.')
        }
    }
}

function managedPath(root, relativePath){
    const resolvedRoot = path.resolve(root)
    const resolved = path.resolve(root, ...relativePath.split('/'))
    if(!resolved.startsWith(resolvedRoot + path.sep)){
        throw new Error('Toketmon live patch path escaped its managed root: ' + relativePath)
    }
    return resolved
}

function prepareLivePatchFiles(patch){
    const patchRoot = path.join(packRoot(), 'live-patches', String(patch.revision))
    const stagingRoot = path.join(patchRoot, 'staging')
    fs.removeSync(stagingRoot)
    fs.ensureDirSync(stagingRoot)

    for(const item of patch.files){
        const destination = managedPath(stagingRoot, item.path)
        const partial = destination + '.part'
        fs.ensureDirSync(path.dirname(destination))

        console.log('[KTZ Toketmon] Downloading live patch file:', item.path)
        const command = '$ProgressPreference=' + quotePowerShell('SilentlyContinue') + '; Invoke-WebRequest -UseBasicParsing -Uri ' +
            quotePowerShell(item.url) + ' -OutFile ' + quotePowerShell(partial)
        runPowerShell(command)
        verifyDownload(partial, item)
        fs.moveSync(partial, destination, { overwrite: true })
    }

    return { patchRoot, stagingRoot }
}

function markLivePatchApplied(manifest, patch){
    const state = readInstalledState()
    if(state == null || state.installedVersion !== manifest.version){
        throw new Error('Toketmon live patch cannot update an unknown pack state.')
    }

    state.livePatchRevision = patch.revision
    state.lastPatchedAt = new Date().toISOString()
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

function applyLivePatch(manifest){
    const patch = manifest.livePatch
    if(patch == null){
        return false
    }

    const installed = readInstalledState()
    const currentRevision = Number(installed?.livePatchRevision || 0)
    if(currentRevision >= patch.revision){
        return false
    }

    setStatus('토켓몬 실시간 패치를 적용하고 있어요...')
    console.log('[KTZ Toketmon] Applying live patch revision:', patch.revision)

    const { patchRoot, stagingRoot } = prepareLivePatchFiles(patch)
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
                console.log('[KTZ Toketmon] Live patch removed or replaced:', relativePath)
            }
        }

        for(const item of patch.files){
            const source = managedPath(stagingRoot, item.path)
            const target = managedPath(gameDirectory(), item.path)
            fs.ensureDirSync(path.dirname(target))
            fs.moveSync(source, target, { overwrite: true })
            installedFiles.push(target)
            console.log('[KTZ Toketmon] Live patch installed:', item.path)
        }

        markLivePatchApplied(manifest, patch)
        fs.removeSync(patchRoot)
        console.log('[KTZ Toketmon] Live patch complete:', patch.revision)
        return true
    } catch(err) {
        console.error('[KTZ Toketmon] Live patch failed. Restoring previous files.', err)
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

function downloadPack(manifest){
    const downloadDir = path.join(packRoot(), 'downloads', manifest.version)
    const destination = path.join(downloadDir, manifest.fileName)
    const partial = destination + '.part'
    fs.ensureDirSync(downloadDir)

    if(fs.existsSync(destination)){
        try {
            verifyDownload(destination, manifest)
            console.log('[KTZ Toketmon] Reusing cached client pack:', destination)
            return destination
        } catch(err) {
            console.warn('[KTZ Toketmon] Cached client pack is invalid. Downloading again.', err.message)
            fs.removeSync(destination)
        }
    }

    fs.removeSync(partial)
    setStatus('토켓몬 클라이언트팩을 다운로드하고 있어요...')
    console.log('[KTZ Toketmon] Downloading client pack ' + manifest.version + ':', manifest.url)

    const command = '$ProgressPreference=\'SilentlyContinue\'; Invoke-WebRequest -UseBasicParsing -Uri ' +
        quotePowerShell(manifest.url) + ' -OutFile ' + quotePowerShell(partial)

    runPowerShell(command)
    fs.moveSync(partial, destination, { overwrite: true })
    verifyDownload(destination, manifest)
    return destination
}

function extractPack(zipPath, manifest){
    const extractDir = path.join(packRoot(), 'staging', manifest.version, 'extracted')
    fs.removeSync(extractDir)
    fs.ensureDirSync(extractDir)

    setStatus('토켓몬 클라이언트팩의 압축을 풀고 있어요...')
    console.log('[KTZ Toketmon] Extracting client pack:', extractDir)

    const command = 'Expand-Archive -LiteralPath ' + quotePowerShell(zipPath) +
        ' -DestinationPath ' + quotePowerShell(extractDir) + ' -Force'
    runPowerShell(command)
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
        default:
            return 0
    }
}

function findPayloadDir(extractDir, type){
    const expectedNames = type === 'datapacks' ? ['datapacks', 'datapack'] : [type]
    const directCandidates = []

    for(const name of expectedNames){
        directCandidates.push(path.join(extractDir, name))
        directCandidates.push(path.join(extractDir, 'build', 'toketmon-pack', name))
        directCandidates.push(path.join(extractDir, 'toketmon-pack', name))
        directCandidates.push(path.join(extractDir, 'files', name, SERVER_ID))
    }

    for(const candidate of directCandidates){
        if(scorePayloadDir(candidate, type) > 0){
            console.log('[KTZ Toketmon] Selected ' + type + ' payload source:', candidate)
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
        console.log('[KTZ Toketmon] Selected ' + type + ' payload source:', best, 'files=' + bestScore)
        return best
    }

    throw new Error('Toketmon client pack does not contain a non-empty ' + type + ' folder.')
}

function createStagingInstance(extractDir, manifest){
    const stagingRoot = path.join(packRoot(), 'staging', manifest.version, 'instance')
    fs.removeSync(stagingRoot)
    fs.ensureDirSync(stagingRoot)

    setStatus('토켓몬 모드와 설정을 준비하고 있어요...')

    for(const type of MANAGED_DIRS){
        const source = findPayloadDir(extractDir, type)
        const target = path.join(stagingRoot, type)
        fs.copySync(source, target, { overwrite: true, errorOnExist: false })
        removeGitkeepFiles(target)
    }

    if(!hasValidPayload(stagingRoot)){
        throw new Error('Toketmon client pack staging payload is incomplete.')
    }

    return stagingRoot
}

function installStagedPayload(stagingRoot, manifest){
    const gameDir = gameDirectory()
    const backupRoot = path.join(packRoot(), 'backup', Date.now().toString())
    const movedToBackup = []
    const movedFromStaging = []

    fs.ensureDirSync(gameDir)
    fs.ensureDirSync(backupRoot)
    setStatus('토켓몬 클라이언트팩을 적용하고 있어요...')

    try {
        for(const name of MANAGED_DIRS){
            const target = path.join(gameDir, name)
            if(fs.existsSync(target)){
                const backup = path.join(backupRoot, name)
                fs.moveSync(target, backup, { overwrite: true })
                movedToBackup.push({ target, backup })
            }
        }

        for(const name of MANAGED_DIRS){
            const source = path.join(stagingRoot, name)
            const target = path.join(gameDir, name)
            fs.moveSync(source, target, { overwrite: true })
            movedFromStaging.push(target)
        }

        if(!hasValidPayload(gameDir)){
            throw new Error('Toketmon client pack installation validation failed.')
        }

        writeInstalledState(manifest)
        fs.removeSync(legacyMarkerPath())
        fs.removeSync(backupRoot)
        console.log('[KTZ Toketmon] Client pack installation complete:', manifest.version)
    } catch(err) {
        console.error('[KTZ Toketmon] Installation failed. Restoring previous client pack.', err)

        for(const target of movedFromStaging){
            fs.removeSync(target)
        }
        for(const item of movedToBackup.reverse()){
            if(fs.existsSync(item.backup)){
                fs.moveSync(item.backup, item.target, { overwrite: true })
            }
        }
        throw err
    }
}

function prepareSync(serverId){
    if(serverId !== SERVER_ID){
        return null
    }

    setStatus('토켓몬 클라이언트팩 업데이트를 확인하고 있어요...')
    const manifest = loadRemoteManifest()
    enforceMinimumLauncherVersion(manifest)

    let installed = readInstalledState()
    const migrated = migrateLegacyInstall()
    if(migrated != null){
        installed = migrated
    }

    if(installed?.installedVersion === manifest.version && hasValidPayload(gameDirectory())){
        console.log('[KTZ Toketmon] Client pack is up to date:', manifest.version)
        applyLivePatch(manifest)
        return manifest
    }

    console.log(
        '[KTZ Toketmon] Client pack update required. Installed=' +
        (installed?.installedVersion || 'none') + ', Remote=' + manifest.version
    )

    const zipPath = downloadPack(manifest)
    const extractDir = extractPack(zipPath, manifest)
    const stagingRoot = createStagingInstance(extractDir, manifest)
    installStagedPayload(stagingRoot, manifest)
    applyLivePatch(manifest)

    fs.removeSync(path.join(packRoot(), 'staging', manifest.version))
    return manifest
}

function reset(){
    fs.removeSync(statePath())
    fs.removeSync(legacyMarkerPath())
    fs.removeSync(path.join(packRoot(), 'staging'))
    fs.removeSync(path.join(packRoot(), 'live-patches'))
}

function installedVersion(){
    return readInstalledState()?.installedVersion || null
}

module.exports = {
    MANIFEST_URL,
    prepareSync,
    reset,
    installedVersion,
    hasValidPayload
}
