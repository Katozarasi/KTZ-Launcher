const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const root = path.resolve(__dirname, '..')
const rawBase = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main'
const arg = name => process.argv[process.argv.indexOf(`--${name}`) + 1]
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const writeJson = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}
const hash = (buffer, algorithm) => crypto.createHash(algorithm).update(buffer).digest('hex')

async function main() {
    for (const key of ['profile', 'index', 'defaults', 'report']) {
        if (!process.argv.includes(`--${key}`)) throw new Error(`Missing --${key}`)
    }
    const profile = path.resolve(arg('profile'))
    const index = readJson(arg('index'))
    const mods = fs.readdirSync(path.join(profile, 'mods')).filter(name => name.endsWith('.jar')).sort()
    const inventory = []
    const modules = []
    const ids = new Set()
    for (const file of mods) {
        const source = path.join(profile, 'mods', file)
        const data = fs.readFileSync(source)
        // Fabric accepts multiline description strings in some published mods.
        // Normalize only metadata text for inspection; keep the JAR bytes intact.
        const rawMetadata = new AdmZip(data).readAsText('fabric.mod.json')
        const metadata = JSON.parse(rawMetadata.replace(/"(?:[^"\\]|\\.)*"/gs,
            value => value.replace(/[\u0000-\u001f]/g,
                character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)))
        if (!metadata.id || ids.has(metadata.id) || metadata.environment === 'server') throw new Error(`Invalid client mod: ${file}`)
        ids.add(metadata.id)
        const sha512 = hash(data, 'sha512')
        const pinned = index.files.find(item => item.hashes.sha512 === sha512 && item.env.client !== 'unsupported')
        const record = {
            file, id: metadata.id, version: metadata.version,
            size: data.length, md5: hash(data, 'md5'), sha256: hash(data, 'sha256'), sha512,
            url: pinned?.downloads[0] || null,
            custom: metadata.id.startsWith('tokemon_')
        }
        if (record.custom) {
            const relative = `files/mods/tokemon/${file}`
            fs.mkdirSync(path.join(root, 'files/mods/tokemon'), { recursive: true })
            fs.writeFileSync(path.join(root, relative), data)
            record.url = `${rawBase}/${relative}`
        }
        inventory.push(record)
    }
    const unresolved = inventory.filter(item => !item.url)
    if (unresolved.length) {
        const response = await fetch('https://api.modrinth.com/v2/version_files', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'KTZ-Launcher/TokemonImport' },
            body: JSON.stringify({ hashes: unresolved.map(item => item.sha512), algorithm: 'sha512' }),
            signal: AbortSignal.timeout(30000)
        })
        if (!response.ok) throw new Error(`Modrinth lookup: ${response.status}`)
        const found = await response.json()
        for (const item of unresolved) {
            const version = found[item.sha512]
            const file = version?.files.find(file => file.hashes.sha512 === item.sha512)
            if (!file || !version.loaders.includes('fabric') || !version.game_versions.includes(index.dependencies.minecraft)) {
                throw new Error(`No matching public Fabric artifact for ${item.file}`)
            }
            item.url = file.url
        }
    }
    for (const item of inventory) {
        modules.push({
            id: `ktz.tokemon:${item.id}:${item.sha256.slice(0, 12)}`, name: `${item.id} ${item.version}`,
            type: 'FabricMod', required: { value: true },
            artifact: { size: item.size, MD5: item.md5, url: item.url }
        })
        if (hash(fs.readFileSync(path.join(profile, 'mods', item.file)), 'sha256') !== item.sha256) {
            throw new Error(`Source changed during import: ${item.file}`)
        }
    }
    const files = [
        { source: path.join(profile, 'resourcepacks/Tokemon-Korean-1.0.0.zip'), target: 'resourcepacks/Tokemon-Korean-1.0.0.zip' },
        { source: arg('defaults'), target: 'config/defaultoptions/options.txt' }
    ]
    for (const item of files) {
        const sourceData = fs.readFileSync(item.source)
        // Git serves text with LF line endings, so hash the published bytes.
        const data = item.target.endsWith('.txt')
            ? Buffer.from(sourceData.toString('utf8').replace(/\r\n/g, '\n')) : sourceData
        const relative = `files/packs/tokemon/${item.target}`
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
        fs.writeFileSync(path.join(root, relative), data)
        modules.push({
            id: `tokemon:${item.target.replace(/[^a-zA-Z0-9]/g, '-')}:1.0.0`, name: item.target,
            type: 'File', required: { value: true },
            artifact: { size: data.length, MD5: hash(data, 'md5'), path: item.target, url: `${rawBase}/${relative}` }
        })
    }
    const config = {
        name: '토켓몬', description: 'Cobblemon과 함께하는 토켓몬 서버', address: '1.224.237.11',
        minecraftVersion: index.dependencies.minecraft, mainServer: false, autoconnect: true,
        javaOptions: { supported: '>=21', suggestedMajor: 21, ram: { recommended: 6144, minimum: 4096 } },
        ktz: {
            loader: 'fabric', loaderName: 'Fabric', loaderVersion: index.dependencies['fabric-loader'], serverSelectVisible: true,
            i18n: {
                ko_KR: { name: '토켓몬', subtitle: 'Cobblemon · Minecraft 1.21.1' },
                en_US: { name: 'Tokemon', subtitle: 'Cobblemon · Minecraft 1.21.1' },
                ja_JP: { name: 'トケモン', subtitle: 'Cobblemon · Minecraft 1.21.1' }
            },
            thumbnail: `${rawBase}/app/assets/images/servers/default_thumb.svg`,
            serverSelectBackground: `${rawBase}/app/assets/images/servers/tokemon_bg_20261022.png`,
            landingBackground: `${rawBase}/app/assets/images/servers/tokemon_bg_20261022.png`,
            maintenance: false
        }
    }
    const admin = readJson(path.join(root, 'admin/servers.json'))
    admin.servers.tokemon = config
    writeJson(path.join(root, 'admin/servers.json'), admin)
    const distro = readJson(path.join(root, 'distribution.json'))
    const existing = distro.servers.find(server => server.id === 'tokemon')
    const entry = {
        ...config, id: 'tokemon', version: '2026.10.17', icon: config.ktz.thumbnail,
        modules: [...(existing?.modules || []).filter(module => module.type === 'Fabric'), ...modules]
    }
    if (existing) distro.servers[distro.servers.indexOf(existing)] = entry
    else distro.servers.push(entry)
    writeJson(path.join(root, 'distribution.json'), distro)
    const report = { minecraft: config.minecraftVersion, loader: config.ktz.loaderVersion, address: config.address, modCount: mods.length, mods: inventory }
    writeJson(path.join(root, 'docs/packs/tokemon-files.json'), report)
    writeJson(arg('report'), report)
    console.log(JSON.stringify({ modCount: mods.length, publicMods: inventory.filter(item => !item.custom).length, customMods: inventory.filter(item => item.custom).length, files: files.length }))
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
