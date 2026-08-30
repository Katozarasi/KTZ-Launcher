const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const http = require('http')
const https = require('https')

const root = path.resolve(__dirname, '..')
const distroPath = path.join(root, 'distribution.json')
const adminPath = path.join(root, 'admin', 'servers.json')
const cacheDir = process.env.KTZ_CACHE_DIR || (
    process.platform === 'win32' && fs.existsSync('E:\\Codex\\Cache')
        ? 'E:\\Codex\\Cache\\KTZ-Launcher'
        : path.join(root, '.ktz-cache')
)
const rawBaseUrl = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main'

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function writeJson(p, v) {
    fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8')
}

function md5Buffer(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex')
}

function mavenNameToPath(name) {
    const parts = name.split(':')
    const group = parts[0]
    const artifact = parts[1]
    const version = parts[2]
    const classifier = parts[3]
    const file = classifier ? `${artifact}-${version}-${classifier}.jar` : `${artifact}-${version}.jar`
    return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}

function mavenUrl(base, modulePath) {
    return `${base.replace(/\/$/, '')}/${modulePath}`
}

function download(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http
        client.get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(download(res.headers.location))
                return
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed ${res.statusCode}: ${url}`))
                return
            }
            const chunks = []
            res.on('data', c => chunks.push(c))
            res.on('end', () => resolve(Buffer.concat(chunks)))
        }).on('error', reject)
    })
}

async function cachedDownload(url, cacheName) {
    fs.mkdirSync(cacheDir, { recursive: true })
    const cachePath = path.join(cacheDir, cacheName.replace(/[^a-zA-Z0-9._-]/g, '_'))
    if (fs.existsSync(cachePath)) {
        return fs.readFileSync(cachePath)
    }
    const buffer = await download(url)
    fs.writeFileSync(cachePath, buffer)
    return buffer
}

async function artifactFromUrl(url, cacheName, fallbackSize) {
    const buffer = await cachedDownload(url, cacheName)
    return {
        size: fallbackSize || buffer.length,
        MD5: md5Buffer(buffer)
    }
}

function resolveLibraryArtifact(lib) {
    const artifact = lib.downloads && lib.downloads.artifact
    if (artifact && artifact.url) {
        return {
            url: artifact.url,
            path: artifact.path || mavenNameToPath(lib.name),
            size: artifact.size
        }
    }

    if (lib.url && lib.name) {
        const modulePath = mavenNameToPath(lib.name)
        return {
            url: mavenUrl(lib.url, modulePath),
            path: modulePath,
            size: null
        }
    }

    return null
}

function localVersionManifestModule(manifest, loader) {
    const manifestPath = `files/loaders/${loader}/versions/${manifest.id}/${manifest.id}.json`
    const abs = path.join(root, manifestPath)
    const data = fs.readFileSync(abs)
    return {
        id: manifest.id,
        name: `${loader === 'fabric' ? 'Fabric Loader' : 'NeoForge'} ${manifest.id} (version.json)`,
        type: 'VersionManifest',
        artifact: {
            size: data.length,
            MD5: md5Buffer(data),
            url: `${rawBaseUrl}/${manifestPath}`
        }
    }
}

async function libraryModule(lib) {
    const resolved = resolveLibraryArtifact(lib)
    if (!resolved) return null
    const stats = await artifactFromUrl(resolved.url, resolved.path, resolved.size)
    return {
        id: lib.name,
        name: lib.name,
        type: 'Library',
        artifact: {
            size: stats.size,
            MD5: stats.MD5,
            path: resolved.path,
            url: resolved.url
        }
    }
}

async function buildNeoForgeModule(serverId, cfg) {
    const manifestId = cfg.ktz.loaderManifest || 'neoforge-21.4.157'
    const manifestFile = path.join(root, 'files', 'loaders', 'neoforge', 'versions', manifestId, `${manifestId}.json`)
    const manifest = readJson(manifestFile)
    const libraries = []
    for (const lib of manifest.libraries || []) {
        const module = await libraryModule(lib)
        if (module) libraries.push(module)
    }
    return {
        id: `net.neoforged:neoforge:${cfg.ktz.loaderVersion || '21.4.157'}`,
        name: `NeoForge ${cfg.minecraftVersion}-${cfg.ktz.loaderVersion || '21.4.157'}`,
        type: 'ForgeHosted',
        artifact: {
            size: 1,
            MD5: 'c4ca4238a0b923820dcc509a6f75849b',
            path: `net/neoforged/neoforge/${cfg.ktz.loaderVersion || '21.4.157'}/neoforge-${cfg.ktz.loaderVersion || '21.4.157'}.jar`,
            url: `${rawBaseUrl}/files/loaders/neoforge/placeholder/neoforge-placeholder.jar`
        },
        subModules: [
            localVersionManifestModule(manifest, 'neoforge'),
            ...libraries
        ]
    }
}

async function buildFabricModule(serverId, cfg) {
    const loaderVersion = cfg.ktz.loaderVersion || '0.18.4'
    const profileUrl = cfg.ktz.loaderManifestUrl || `https://meta.fabricmc.net/v2/versions/loader/${cfg.minecraftVersion}/${loaderVersion}/profile/json`
    const cacheName = `fabric-loader-${cfg.minecraftVersion}-${loaderVersion}.json`
    const manifestBuffer = await cachedDownload(profileUrl, cacheName)
    const manifest = JSON.parse(manifestBuffer.toString('utf8'))

    const manifestDir = path.join(root, 'files', 'loaders', 'fabric', 'versions', manifest.id)
    fs.mkdirSync(manifestDir, { recursive: true })
    fs.writeFileSync(path.join(manifestDir, `${manifest.id}.json`), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

    const libraries = []
    let loaderArtifact = null
    for (const lib of manifest.libraries || []) {
        const module = await libraryModule(lib)
        if (!module) continue
        if (lib.name === `net.fabricmc:fabric-loader:${loaderVersion}`) {
            loaderArtifact = module.artifact
        } else {
            libraries.push(module)
        }
    }

    if (!loaderArtifact) {
        throw new Error('Fabric loader artifact was not found in Fabric profile: ' + profileUrl)
    }

    return {
        id: `net.fabricmc:fabric-loader:${loaderVersion}`,
        name: `Fabric Loader ${cfg.minecraftVersion}-${loaderVersion}`,
        type: 'Fabric',
        artifact: loaderArtifact,
        subModules: [
            localVersionManifestModule(manifest, 'fabric'),
            ...libraries
        ]
    }
}

function makeServer(id, cfg) {
    const ko = cfg.ktz && cfg.ktz.i18n && cfg.ktz.i18n.ko_KR
    return {
        id,
        name: cfg.name || (ko && ko.name) || id,
        description: cfg.description || '',
        icon: cfg.ktz && cfg.ktz.thumbnail || 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/app/assets/images/servers/default_thumb.svg',
        version: '1.0.0',
        address: cfg.address || '1.224.237.11',
        minecraftVersion: cfg.minecraftVersion,
        mainServer: !!cfg.mainServer,
        autoconnect: cfg.autoconnect !== false,
        javaOptions: cfg.javaOptions,
        modules: [],
        ktz: {}
    }
}

async function applyOne(distro, id, cfg) {
    let server = distro.servers.find(s => s.id === id)
    if (!server) {
        server = makeServer(id, cfg)
        distro.servers.push(server)
    }

    if (cfg.name !== undefined) server.name = cfg.name
    if (cfg.description !== undefined) server.description = cfg.description
    if (cfg.address !== undefined) server.address = cfg.address
    if (cfg.minecraftVersion !== undefined) server.minecraftVersion = cfg.minecraftVersion
    if (cfg.mainServer !== undefined) server.mainServer = cfg.mainServer
    if (cfg.autoconnect !== undefined) server.autoconnect = cfg.autoconnect
    if (cfg.javaOptions !== undefined) server.javaOptions = cfg.javaOptions

    server.ktz = Object.assign({}, server.ktz || {}, cfg.ktz || {})

    const ko = server.ktz.i18n && server.ktz.i18n.ko_KR
    if (ko && ko.name) server.ktz.shortName = ko.name
    if (ko && ko.subtitle) server.ktz.subtitle = ko.subtitle

    if (server.ktz.thumbnail) server.icon = server.ktz.thumbnail

    if (server.ktz.loader === 'neoforge') {
        const generated = await buildNeoForgeModule(server.id, cfg)
        const preserved = (server.modules || []).filter(m => m.type !== 'ForgeHosted')
        server.modules = [generated, ...preserved]
    } else if (server.ktz.loader === 'fabric') {
        const generated = await buildFabricModule(server.id, cfg)
        const preserved = (server.modules || []).filter(m => m.type !== 'Fabric')
        server.modules = [generated, ...preserved]
    }
}

async function main() {
    const target = process.argv[2]
    const distro = readJson(distroPath)
    const admin = readJson(adminPath)
    const ids = target ? [target] : Object.keys(admin.servers || {})

    if (!target) {
        const allowed = new Set(ids)
        distro.servers = (distro.servers || []).filter(s => allowed.has(s.id))
    }

    for (const id of ids) {
        const cfg = admin.servers[id]
        if (!cfg) throw new Error('Missing admin server config: ' + id)
        await applyOne(distro, id, cfg)
        console.log('Applied server config:', id)
    }

    writeJson(distroPath, distro)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
