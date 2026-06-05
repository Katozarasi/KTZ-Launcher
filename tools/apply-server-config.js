const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const http = require('http')
const https = require('https')

const root = path.resolve(__dirname, '..')
const distroPath = path.join(root, 'distribution.json')
const adminPath = path.join(root, 'admin', 'servers.json')
const cacheDir = path.join(root, '.ktz-cache')
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

async function md5FromUrl(url, cacheName) {
  fs.mkdirSync(cacheDir, { recursive: true })
  const cachePath = path.join(cacheDir, cacheName.replace(/[^a-zA-Z0-9._-]/g, '_'))
  let buffer
  if (fs.existsSync(cachePath)) {
    buffer = fs.readFileSync(cachePath)
  } else {
    buffer = await download(url)
    fs.writeFileSync(cachePath, buffer)
  }
  return md5Buffer(buffer)
}

function versionManifestModule(manifest, serverId) {
  const manifestPath = `files/loaders/neoforge/versions/${manifest.id}/${manifest.id}.json`
  const abs = path.join(root, manifestPath)
  const data = fs.readFileSync(abs)
  return {
    id: manifest.id,
    name: `NeoForge ${manifest.id} (version.json)`,
    type: 'VersionManifest',
    artifact: {
      size: data.length,
      MD5: md5Buffer(data),
      url: `${rawBaseUrl}/${manifestPath}`
    }
  }
}

async function libraryModule(lib) {
  const artifact = lib.downloads && lib.downloads.artifact
  if (!artifact || !artifact.url) return null
  const modulePath = artifact.path || mavenNameToPath(lib.name)
  const md5 = await md5FromUrl(artifact.url, modulePath)
  return {
    id: lib.name,
    name: lib.name,
    type: 'Library',
    artifact: {
      size: artifact.size,
      MD5: md5,
      path: modulePath,
      url: artifact.url
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
      versionManifestModule(manifest, serverId),
      ...libraries
    ]
  }
}

async function applyOne(server, cfg) {
  if (cfg.name !== undefined) server.name = cfg.name
  if (cfg.description !== undefined) server.description = cfg.description
  if (cfg.minecraftVersion !== undefined) server.minecraftVersion = cfg.minecraftVersion
  if (cfg.javaOptions !== undefined) server.javaOptions = cfg.javaOptions

  server.ktz = Object.assign({}, server.ktz || {}, cfg.ktz || {})

  const ko = server.ktz.i18n && server.ktz.i18n.ko_KR
  if (ko && ko.name) server.ktz.shortName = ko.name
  if (ko && ko.subtitle) server.ktz.subtitle = ko.subtitle

  if (server.ktz.loader === 'neoforge') {
    const generated = await buildNeoForgeModule(server.id, cfg)
    const preserved = (server.modules || []).filter(m => {
      if (m.type === 'ForgeHosted') return false
      return true
    })
    server.modules = [generated, ...preserved]
  }
}

async function main() {
  const target = process.argv[2]
  const distro = readJson(distroPath)
  const admin = readJson(adminPath)
  const ids = target ? [target] : Object.keys(admin.servers || {})

  for (const id of ids) {
    const cfg = admin.servers[id]
    if (!cfg) throw new Error('Missing admin server config: ' + id)
    const server = distro.servers.find(s => s.id === id)
    if (!server) throw new Error('Missing distribution server: ' + id)
    await applyOne(server, cfg)
    console.log('Applied server config:', id)
  }

  writeJson(distroPath, distro)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
