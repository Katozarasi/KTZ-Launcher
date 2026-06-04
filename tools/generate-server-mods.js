const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const DISTRO_PATH = path.join(ROOT, 'distribution.json')
const CONFIG_PATH = path.join(__dirname, 'server-mods.config.json')

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function md5File(filePath) {
    const hash = crypto.createHash('md5')
    hash.update(fs.readFileSync(filePath))
    return hash.digest('hex')
}

function toSafeMavenPart(value) {
    return value
        .replace(/\.jar$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function createModModule(serverConfig, relativeModsDir, fileName, absoluteFilePath) {
    const stat = fs.statSync(absoluteFilePath)
    const safeName = toSafeMavenPart(fileName)
    const urlPath = `${relativeModsDir.replace(/\\/g, '/')}/${encodeURIComponent(fileName).replace(/%2F/g, '/')}`

    return {
        id: `${serverConfig.idPrefix}:${safeName}:1.0.0`,
        name: fileName.replace(/\.jar$/i, ''),
        type: serverConfig.modType,
        artifact: {
            size: stat.size,
            MD5: md5File(absoluteFilePath),
            url: `${serverConfig.rawBaseUrl}/${urlPath}`
        }
    }
}

function updateServerMods(serverId) {
    const config = readJson(CONFIG_PATH)
    const distro = readJson(DISTRO_PATH)
    const serverConfig = config.servers[serverId]

    if (!serverConfig) {
        throw new Error(`Unknown server id: ${serverId}`)
    }

    const server = distro.servers.find(s => s.id === serverId)
    if (!server) {
        throw new Error(`Server not found in distribution.json: ${serverId}`)
    }

    const relativeModsDir = serverConfig.modsDir.replace(/\\/g, '/')
    const absoluteModsDir = path.join(ROOT, relativeModsDir)

    if (!fs.existsSync(absoluteModsDir)) {
        fs.mkdirSync(absoluteModsDir, { recursive: true })
    }

    const jarFiles = fs.readdirSync(absoluteModsDir)
        .filter(file => file.toLowerCase().endsWith('.jar'))
        .sort((a, b) => a.localeCompare(b))

    const configForModule = {
        ...serverConfig,
        rawBaseUrl: config.rawBaseUrl.replace(/\/$/, '')
    }

    const generatedMods = jarFiles.map(fileName => {
        return createModModule(
            configForModule,
            relativeModsDir,
            fileName,
            path.join(absoluteModsDir, fileName)
        )
    })

    const preserveTypes = new Set(serverConfig.preserveModuleTypes || [])
    const preservedModules = (server.modules || []).filter(module => preserveTypes.has(module.type))

    server.modules = [
        ...preservedModules,
        ...generatedMods
    ]

    writeJson(DISTRO_PATH, distro)

    console.log(`Updated ${serverId}`)
    console.log(`Preserved modules: ${preservedModules.length}`)
    console.log(`Generated mod modules: ${generatedMods.length}`)

    for (const mod of generatedMods) {
        console.log(`- ${mod.name} | ${mod.artifact.size} bytes | ${mod.artifact.MD5}`)
    }
}

function main() {
    const serverId = process.argv[2]

    if (!serverId) {
        console.error('Usage: node tools/generate-server-mods.js <serverId>')
        console.error('Example: node tools/generate-server-mods.js city_ability')
        process.exit(1)
    }

    updateServerMods(serverId)
}

main()
