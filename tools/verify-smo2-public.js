const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const output = process.argv[2] || 'C:/codex/Builds/SMO2-Launcher-20261030/profile'
const commit = process.argv[3]
assert(/^[a-f0-9]{40}$/.test(commit), 'Pass the published commit SHA')
const raw = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
async function bytes(url) {
    let error
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            const response = await fetch(url + '?kao_version=' + commit, { signal: AbortSignal.timeout(60000) })
            assert(response.ok, `Download ${response.status}: ${url}`)
            return Buffer.from(await response.arrayBuffer())
        } catch (failure) {
            error = failure
            await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
        }
    }
    throw error
}

async function main() {
    const expected = read(path.join(root, 'distribution.json'))
    const remote = JSON.parse(await bytes(raw + 'distribution.json'))
    const id = 'smo2_theseed'
    const server = remote.servers.find(item => item.id === id)
    assert.deepEqual(server, expected.servers.find(item => item.id === id))
    assert.equal(server.name, 'KAO - THE SEED')
    assert.equal(server.ktz.maintenance, false)
    const before = read(path.join(output, 'backup/distribution.json'))
    assert.deepEqual(remote.servers.filter(item => item.id !== id), before.servers.filter(item => item.id !== id))
    const modules = []
    const visit = items => { for (const item of items) { modules.push(item); visit(item.subModules || []) } }
    visit(server.modules)
    const rawModules = modules.filter(item => item.artifact.url.startsWith(raw))
    let cursor = 0
    let verified = 0
    async function worker() {
        while (cursor < rawModules.length) {
            const module = rawModules[cursor++]
            const data = await bytes(module.artifact.url)
            assert.equal(data.length, module.artifact.size, module.name)
            assert.equal(crypto.createHash('md5').update(data).digest('hex'), module.artifact.MD5, module.name)
            verified++
            if (verified % 50 === 0) console.log(`Raw artifacts verified ${verified}/${rawModules.length}`)
        }
    }
    const checks = await Promise.allSettled(Array.from({ length: 8 }, worker))
    const failed = checks.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
    const assets = read(path.join(output, 'publication-assets.json'))
    assert.equal(assets.assets, 136)
    const result = { status: 'PUBLISHED_AND_REMOTE_VERIFIED', commit, name: server.name, serverId: id, address: server.address,
        maintenance: server.ktz.maintenance, originalServersPreserved: true, rawFilesDownloadedAndMd5Verified: verified,
        releaseAssetsDownloadedAndSha256Verified: assets.assets, releaseUrl: assets.release, launcherLatestUnchanged: assets.launcherLatestUnchanged }
    fs.writeFileSync(path.join(output, 'publication.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
