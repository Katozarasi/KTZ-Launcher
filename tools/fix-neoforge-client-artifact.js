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

const universalLibrary = {
  id: 'net.neoforged:neoforge:21.4.157:universal',
  name: 'NeoForge 21.4.157 Universal Support',
  type: 'Library',
  classpath: false,
  artifact: {
    size: 3513954,
    MD5: 'cf63fa31dff33454624a0ec4c5a62cee',
    path: 'net/neoforged/neoforge/21.4.157/neoforge-21.4.157-universal.jar',
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/files/loaders/neoforge/21.4.157/neoforge-21.4.157-universal.jar'
  }
}

const clientLibrary = {
  id: 'net.neoforged:neoforge:21.4.157:client',
  name: 'NeoForge 21.4.157 Client Support',
  type: 'Library',
  classpath: false,
  artifact: {
    size: 5891137,
    MD5: '70505efad05655c750012855fe3b0c7f',
    path: 'net/neoforged/neoforge/21.4.157/neoforge-21.4.157-client.jar',
    url: 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/files/loaders/neoforge/21.4.157/neoforge-21.4.157-client.jar'
  }
}

loader.subModules = (loader.subModules || []).filter(m => {
  return m.id !== clientLibrary.id &&
    m.id !== universalLibrary.id
})
loader.subModules.push(universalLibrary)
loader.subModules.push(clientLibrary)

fs.writeFileSync(distroPath, JSON.stringify(distro, null, 2) + '\n', 'utf8')
console.log('NeoForge generated version jar, universal support, and client support applied to kato_empire_test')
