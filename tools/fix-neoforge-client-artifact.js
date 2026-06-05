const fs = require('fs')

const distroPath = 'distribution.json'
const distro = JSON.parse(fs.readFileSync(distroPath, 'utf8'))
const server = distro.servers.find(s => s.id === 'kato_empire_test')
if (!server) throw new Error('kato_empire_test not found')

const loader = server.modules.find(m => m.id === 'net.neoforged:neoforge:21.4.157')
if (!loader) throw new Error('NeoForge loader not found. Run npm run generate:server kato_empire_test first.')

loader.artifact = {
  size: 28335587,
  MD5: '70e2838411853210dce14bdd30769458',
  path: 'net/neoforged/neoforge/21.4.157/neoforge-21.4.157.jar',
  url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/files/loaders/neoforge/21.4.157/neoforge-21.4.157.jar'
}

loader.subModules = (loader.subModules || []).filter(m => m.id !== 'net.neoforged:neoforge:21.4.157:client')

fs.writeFileSync(distroPath, JSON.stringify(distro, null, 2) + '\n', 'utf8')
console.log('NeoForge generated version jar applied to kato_empire_test')
