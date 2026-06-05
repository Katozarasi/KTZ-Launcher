const fs = require('fs')

const distroPath = 'distribution.json'
const distro = JSON.parse(fs.readFileSync(distroPath, 'utf8'))
const server = distro.servers.find(s => s.id === 'kato_empire_test')
if (!server) throw new Error('kato_empire_test not found')

const loader = server.modules.find(m => m.id === 'net.neoforged:neoforge:21.4.157')
if (!loader) throw new Error('NeoForge loader not found. Run npm run generate:server kato_empire_test first.')

loader.artifact = {
  size: 3513954,
  MD5: 'cf63fa31dff33454624a0ec4c5a62cee',
  path: 'net/neoforged/neoforge/21.4.157/neoforge-21.4.157-universal.jar',
  url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/files/loaders/neoforge/21.4.157/neoforge-21.4.157-universal.jar'
}

fs.writeFileSync(distroPath, JSON.stringify(distro, null, 2) + '\n', 'utf8')
console.log('NeoForge universal artifact applied to kato_empire_test')
