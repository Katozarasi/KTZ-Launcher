// Build an additive SMO2 profile for the existing KTZ 3.4.3 downloader.
// Usage: node tools/build-smo2-profile.js --client <prepared client> --forge <official client installation> --out <C:/codex build root>
// This stages local files only. Upload release assets before publishing distribution.json.
const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')

const ROOT = path.resolve(__dirname, '..')
const ID = 'smo2_theseed'
const MC = '1.20.1'
const FORGE = '47.4.10'
const RAW = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main'
const arg = (name, fallback) => {
    const index = process.argv.indexOf('--' + name)
    return index < 0 ? fallback : process.argv[index + 1]
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const jsonBytes = data => Buffer.from(JSON.stringify(data, null, 2) + '\n')
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex')
function put(file, bytes) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
}
function safeRelative(value) {
    const normalized = value.replaceAll('\\', '/')
    assert(normalized && !normalized.startsWith('/') && !normalized.includes(':'))
    assert(!normalized.split('/').some(part => part === '..' || part === '.' || part === ''))
    return normalized
}
function walk(base) {
    const result = []
    const visit = (relative = '') => {
        for (const entry of fs.readdirSync(path.join(base, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const next = relative ? relative + '/' + entry.name : entry.name
            assert(!entry.isSymbolicLink(), 'Symlink is not a pack file: ' + next)
            if (entry.isDirectory()) visit(next)
            else if (entry.isFile()) result.push(safeRelative(next))
        }
    }
    visit()
    return result
}

function main() {
    const client = path.resolve(arg('client', 'C:/codex/Projects/SMO2-TheSeed/client'))
    const forge = path.resolve(arg('forge', 'C:/codex/Builds/SMO2-Launcher-20261030/forge-client'))
    const out = path.resolve(arg('out', 'C:/codex/Builds/SMO2-Launcher-20261030/profile'))
    const version = arg('version', '2026.10.30.1')
    assert(out.toLowerCase().startsWith('c:\\codex\\'), 'Build output must stay under C:/codex')
    assert(/^[0-9.]+$/.test(version), 'Invalid release version')
    const tag = 'smo2-client-' + version
    const releaseBase = `https://github.com/Katozarasi/KTZ-Launcher/releases/download/${tag}`
    const beforeDistroBytes = fs.readFileSync(path.join(ROOT, 'distribution.json'))
    const beforeAdminBytes = fs.readFileSync(path.join(ROOT, 'admin/servers.json'))
    const beforeDistro = JSON.parse(beforeDistroBytes)
    const beforeAdmin = JSON.parse(beforeAdminBytes)
    const next = structuredClone(beforeDistro)
    const admin = structuredClone(beforeAdmin)
    const inventory = []
    const releaseAssets = new Map()
    const changedFiles = new Set(['distribution.json', 'admin/servers.json', 'docs/packs/smo2_theseed-files.json',
        'tools/build-smo2-profile.js', 'tools/verify-smo2-profile.js', 'tools/publish-smo2-assets.js', 'tools/verify-smo2-public.js'])
    // Keep source config bytes stable between the checkout and GitHub raw URLs.
    const attributesPath = `files/packs/${ID}/.gitattributes`
    put(path.join(ROOT, attributesPath), Buffer.from('* -text\n'))
    changedFiles.add(attributesPath)

    function artifact(source, target, kind, officialUrl = null, expectedSha1 = null) {
        const bytes = fs.readFileSync(source)
        if (expectedSha1) assert.equal(digest(bytes, 'sha1'), expectedSha1, 'Official Forge library hash mismatch: ' + target)
        const record = { path: target, kind, size: bytes.length, md5: digest(bytes, 'md5'), sha256: digest(bytes) }
        let url = officialUrl
        if (!url) {
            const useRaw = kind === 'config' && bytes.length < 1024 * 1024
            if (useRaw) {
                const relative = `files/packs/${ID}/${target}`
                put(path.join(ROOT, relative), bytes)
                changedFiles.add(relative)
                record.repositoryPath = relative
                url = RAW + '/' + relative.split('/').map(encodeURIComponent).join('/')
            } else {
                const suffix = path.extname(target).toLowerCase() || '.bin'
                const name = 'smo2-' + record.sha256.slice(0, 24) + suffix
                const destination = path.join(out, 'release-assets', name)
                if (!releaseAssets.has(name)) {
                    put(destination, bytes)
                    releaseAssets.set(name, { name, file: destination, size: bytes.length, sha256: record.sha256 })
                }
                record.releaseAsset = name
                url = releaseBase + '/' + name
            }
        }
        record.url = url
        record.source = source
        inventory.push(record)
        return { size: bytes.length, MD5: record.md5, path: target, url }
    }

    const manifestId = `${MC}-forge-${FORGE}`
    const manifest = readJson(path.join(forge, 'versions', manifestId, manifestId + '.json'))
    const installer = path.resolve(arg('installer', path.join(forge, '..', `forge-${MC}-${FORGE}-installer.jar`)))
    const installProfile = JSON.parse(new AdmZip(installer).readAsText('install_profile.json'))
    assert.equal(manifest.id, manifestId)
    assert.equal(manifest.inheritsFrom, MC)
    // The supplied GeckoLib pack races while parsing Molang resources in parallel.
    // This profile-specific launch setting works with the matching ModernFix config.
    manifest.arguments.jvm = manifest.arguments.jvm.filter(argument => !argument.startsWith('-Dmax.bg.threads='))
    manifest.arguments.jvm.push('-Dmax.bg.threads=1')
    const manifestRelative = `files/loaders/forge/versions/${manifestId}/${manifestId}.json`
    const manifestBytes = jsonBytes(manifest)
    put(path.join(ROOT, manifestRelative), manifestBytes)
    changedFiles.add(manifestRelative)
    const manifestModule = {
        id: manifestId, name: `Forge ${MC} / ${FORGE} version manifest`, type: 'VersionManifest',
        artifact: { size: manifestBytes.length, MD5: digest(manifestBytes, 'md5'), url: RAW + '/' + manifestRelative }
    }
    const libraries = []
    let loader = null
    const hiddenRuntimeLibraries = installProfile.libraries.filter(lib => /^net\.minecraftforge:(fmlcore|javafmllanguage|lowcodelanguage|mclanguage|forge):/.test(lib.name))
    const allRuntimeLibraries = [...manifest.libraries, ...hiddenRuntimeLibraries]
    const seenLibraries = new Set()
    for (const lib of allRuntimeLibraries) {
        if (seenLibraries.has(lib.name)) continue
        seenLibraries.add(lib.name)
        const sourceArtifact = lib.downloads?.artifact
        assert(sourceArtifact?.path, 'Unexpected Forge library: ' + lib.name)
        const relative = safeRelative(sourceArtifact.path)
        const local = path.join(forge, 'libraries', relative)
        const module = { id: lib.name, name: lib.name, type: 'Library', artifact: artifact(local, relative, 'library', sourceArtifact.url || null, sourceArtifact.sha1 || null) }
        if (hiddenRuntimeLibraries.includes(lib)) module.classpath = false
        if (lib.name === `net.minecraftforge:forge:${MC}-${FORGE}:universal`) {
            loader = { ...module, type: 'ForgeHosted', name: `Minecraft Forge ${MC}-${FORGE}` }
        } else libraries.push(module)
    }
    assert(loader, 'Forge universal jar is missing')
    // Modern Forge locates these installer outputs through libraryDirectory;
    // they are deliberately absent from the launcher's ordinary classpath.
    for (const [key, hashKey] of [['MC_EXTRA', 'MC_EXTRA_SHA'], ['MC_SRG', null], ['PATCHED', 'PATCHED_SHA']]) {
        const id = installProfile.data[key].client.replace(/^\[|\]$/g, '')
        const [group, artifactName, artifactVersion, classifier] = id.split(':')
        const relative = `${group.replaceAll('.', '/')}/${artifactName}/${artifactVersion}/${artifactName}-${artifactVersion}-${classifier}.jar`
        const expected = hashKey ? installProfile.data[hashKey].client.replaceAll('\'', '') : null
        libraries.push({ id, name: id, type: 'Library', classpath: false, artifact: artifact(path.join(forge, 'libraries', relative), relative, 'library', null, expected) })
    }
    loader.subModules = [manifestModule, ...libraries]

    const files = walk(client).filter(relative =>
        /^mods\/[^/]+\.jar$/i.test(relative) ||
        relative.startsWith('config/') ||
        /^resourcepacks\/[^/]+\.zip$/i.test(relative)
    ).filter(relative => !/(^|\/)(\.DS_Store|Thumbs\.db)$|\.disabled$/i.test(relative))
    assert(files.filter(file => file.startsWith('mods/')).length >= 100, 'Client pack is incomplete')
    const modules = [loader]
    for (const relative of files) {
        const kind = relative.startsWith('mods/') ? 'mod' : relative.startsWith('resourcepacks/') ? 'resourcepack' : 'config'
        const fileArtifact = artifact(path.join(client, relative), relative, kind)
        modules.push({
            id: `ktz.smo2_theseed:file-${digest(Buffer.from(relative)).slice(0, 16)}:${version}`,
            name: relative, type: 'File', required: { value: true }, artifact: fileArtifact
        })
    }
    const config = {
        name: 'KAO - THE SEED', description: 'KAO - THE SEED · Minecraft 1.20.1 / Forge 47.4.10',
        address: '1.224.237.11:25566', minecraftVersion: MC, mainServer: false, autoconnect: true,
        javaOptions: { supported: '21.x', suggestedMajor: 21, ram: { recommended: 8192, minimum: 6144 } },
        ktz: {
            loader: 'forge', loaderName: 'Forge', loaderVersion: FORGE,
            shortName: 'KAO - THE SEED', subtitle: 'Minecraft 1.20.1 · Forge 47.4.10',
            thumbnail: RAW + '/app/assets/images/servers/kao_kato_thumb_20261031.png',
            serverSelectBackground: RAW + '/app/assets/images/servers/kao_seaside_bg_20261030.png',
            landingBackground: RAW + '/app/assets/images/servers/kao_seaside_bg_20261030.png',
            serverSelectVisible: true, maintenance: true,
            maintenanceTitle: 'KAO - THE SEED 준비 중',
            maintenanceMessage: '클라이언트팩과 서버 접속 검증을 진행하고 있습니다. 운영 준비가 완료되면 접속이 열립니다.',
            i18n: {
                ko_KR: { name: 'KAO - THE SEED', subtitle: 'Minecraft 1.20.1 · Forge 47.4.10' },
                en_US: { name: 'KAO - THE SEED', subtitle: 'Minecraft 1.20.1 · Forge 47.4.10' },
                ja_JP: { name: 'KAO - THE SEED', subtitle: 'Minecraft 1.20.1 · Forge 47.4.10' }
            }
        }
    }
    const server = { id: ID, ...config, version, icon: config.ktz.thumbnail, modules }
    const oldIndex = next.servers.findIndex(item => item.id === ID)
    if (oldIndex === -1) next.servers.push(server)
    else next.servers[oldIndex] = server
    admin.servers[ID] = config
    assert.deepEqual(next.servers.filter(item => item.id !== ID), beforeDistro.servers.filter(item => item.id !== ID))
    const withoutTarget = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== ID))
    assert.deepEqual(withoutTarget(admin.servers), withoutTarget(beforeAdmin.servers))
    assert.deepEqual({ ...next, servers: [] }, { ...beforeDistro, servers: [] })
    assert.equal(digest(fs.readFileSync(path.join(ROOT, 'distribution.json'))), digest(beforeDistroBytes), 'Concurrent distribution change')
    assert.equal(digest(fs.readFileSync(path.join(ROOT, 'admin/servers.json'))), digest(beforeAdminBytes), 'Concurrent admin change')
    if (!fs.existsSync(path.join(out, 'backup/distribution.json'))) {
        put(path.join(out, 'backup/distribution.json'), beforeDistroBytes)
        put(path.join(out, 'backup/admin/servers.json'), beforeAdminBytes)
    }
    put(path.join(ROOT, 'distribution.json'), jsonBytes(next))
    put(path.join(ROOT, 'admin/servers.json'), jsonBytes(admin))
    const publicInventory = inventory.map(({ source: _source, ...item }) => item)
    put(path.join(ROOT, 'docs/packs/smo2_theseed-files.json'), jsonBytes({ version, minecraftVersion: MC, forgeVersion: FORGE, files: publicInventory }))
    put(path.join(out, 'inventory-local.json'), jsonBytes(inventory))
    const summary = {
        status: 'STAGED_LOCAL_NOT_PUBLISHED', serverId: ID, version, releaseTag: tag,
        client, forge, maintenance: true, originalServersPreserved: true,
        moduleCount: modules.length, mods: inventory.filter(item => item.kind === 'mod').length,
        resourcepacks: inventory.filter(item => item.kind === 'resourcepack').length,
        configs: inventory.filter(item => item.kind === 'config').length,
        releaseAssets: [...releaseAssets.values()], changedFiles: [...changedFiles].sort()
    }
    put(path.join(out, 'staging.json'), jsonBytes(summary))
    console.log(JSON.stringify({ ...summary, releaseAssets: summary.releaseAssets.length, changedFiles: summary.changedFiles.length }, null, 2))
}

if (require.main === module) main()
module.exports = { safeRelative }
