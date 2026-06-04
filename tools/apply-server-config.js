const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const distroPath = path.join(root, 'distribution.json')
const adminPath = path.join(root, 'admin', 'servers.json')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function writeJson(p, v) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8')
}

function applyOne(server, cfg) {
  if (cfg.name !== undefined) server.name = cfg.name
  if (cfg.description !== undefined) server.description = cfg.description
  if (cfg.minecraftVersion !== undefined) server.minecraftVersion = cfg.minecraftVersion
  if (cfg.javaOptions !== undefined) server.javaOptions = cfg.javaOptions

  server.ktz = Object.assign({}, server.ktz || {}, cfg.ktz || {})

  const ko = server.ktz.i18n && server.ktz.i18n.ko_KR
  if (ko && ko.name) server.ktz.shortName = ko.name
  if (ko && ko.subtitle) server.ktz.subtitle = ko.subtitle
}

function main() {
  const target = process.argv[2]
  const distro = readJson(distroPath)
  const admin = readJson(adminPath)
  const ids = target ? [target] : Object.keys(admin.servers || {})

  for (const id of ids) {
    const cfg = admin.servers[id]
    if (!cfg) throw new Error('Missing admin server config: ' + id)
    const server = distro.servers.find(s => s.id === id)
    if (!server) throw new Error('Missing distribution server: ' + id)
    applyOne(server, cfg)
    console.log('Applied server config:', id)
  }

  writeJson(distroPath, distro)
}

main()
