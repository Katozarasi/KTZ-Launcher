// Publish only immutable KAO client assets. Does not push source or update launcher EXEs/latest.yml.
const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const output = process.argv[2] || 'C:/codex/Builds/SMO2-Launcher-20261030/profile'
const staging = JSON.parse(fs.readFileSync(path.join(output, 'staging.json'), 'utf8'))
const api = 'https://api.github.com/repos/Katozarasi/KTZ-Launcher'
const expectedTag = 'smo2-client-' + staging.version
assert.equal(staging.releaseTag, expectedTag)
assert(staging.releaseAssets.length < 1000)
const credentials = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }
})
const fields = Object.fromEntries(credentials.stdout.trim().split(/\r?\n/).filter(line => line.includes('=')).map(line => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
}))
assert(fields.password, 'No existing GitHub credential is available')
const headers = { Authorization: 'Bearer ' + fields.password, Accept: 'application/vnd.github+json', 'User-Agent': 'KTZ-KAO-Client-Publisher', 'X-GitHub-Api-Version': '2022-11-28' }
let previousMutation = 0
let mutationQueue = Promise.resolve()
async function request(url, options = {}) {
    if (options.method && options.method !== 'GET') {
        const turn = mutationQueue.then(async () => {
            const delay = Math.max(0, previousMutation + 1100 - Date.now())
            if (delay) await new Promise(resolve => setTimeout(resolve, delay))
            previousMutation = Date.now()
        })
        mutationQueue = turn.catch(() => {})
        await turn
    }
    const response = await fetch(url, { headers: { ...headers, ...(options.headers || {}) }, ...options, signal: AbortSignal.timeout(10 * 60 * 1000) })
    if (response.status === 404 && !options.method) return null
    if (!response.ok) throw new Error(`GitHub ${options.method || 'GET'} ${response.status}: ${(await response.text()).slice(0, 300)}`)
    if (response.status === 204) return null
    return response.json()
}
const jsonRequest = (method, data) => ({ method, body: JSON.stringify(data), headers: { ...headers, 'Content-Type': 'application/json' } })

async function main() {
    const latestBefore = await request(api + '/releases/latest')
    let release = await request(api + '/releases/tags/' + expectedTag)
    if (!release) {
        // Draft releases may not resolve through the published tag endpoint.
        const drafts = await request(api + '/releases?per_page=100')
        release = drafts.find(item => item.tag_name === expectedTag)
    }
    if (!release) {
        const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout.trim()
        assert(/^[a-f0-9]{40}$/.test(commit))
        release = await request(api + '/releases', jsonRequest('POST', {
            tag_name: expectedTag, target_commitish: commit, name: 'KAO - THE SEED client assets ' + staging.version,
            body: 'KAO - THE SEED client assets for Minecraft 1.20.1 and Forge 47.4.10.\n\nThis release contains client pack assets for KTZ Launcher. Server availability is controlled separately by the KTZ server list. This is not a launcher application update.',
            draft: true, prerelease: false, make_latest: 'false'
        }))
    }
    assert.equal(release.tag_name, expectedTag)
    const uploaded = []
    const allExisting = []
    for (let page = 1; ; page++) {
        const entries = await request(api + `/releases/${release.id}/assets?per_page=100&page=${page}`)
        allExisting.push(...entries)
        if (entries.length < 100) break
    }
    const byName = new Map(allExisting.map(asset => [asset.name, asset]))
    let uploadCursor = 0
    async function uploadWorker() {
        while (uploadCursor < staging.releaseAssets.length) {
            const asset = staging.releaseAssets[uploadCursor++]
            assert(asset.size < 2 * 1024 ** 3)
            let remote = byName.get(asset.name)
            if (remote?.state === 'starter') {
                // Only recover this upload's incomplete placeholder, never a published binary.
                await request(api + '/releases/assets/' + remote.id, { method: 'DELETE' })
                remote = null
            }
            if (!remote) {
                const data = fs.readFileSync(asset.file)
                assert.equal(data.length, asset.size)
                assert.equal(crypto.createHash('sha256').update(data).digest('hex'), asset.sha256)
                remote = await request(release.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(asset.name), {
                    method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: data
                })
            }
            assert.equal(remote.state, 'uploaded', 'Release asset is not fully uploaded')
            assert.equal(remote.size, asset.size, 'Existing release asset has an unexpected size')
            if (remote.digest) assert.equal(remote.digest, 'sha256:' + asset.sha256, 'Existing release asset differs')
            uploaded.push({ name: asset.name, size: remote.size, sha256: asset.sha256, url: remote.browser_download_url })
            fs.writeFileSync(path.join(output, 'asset-upload-progress.json'), JSON.stringify({ release: release.html_url, completed: uploaded.length, total: staging.releaseAssets.length, uploaded }, null, 2) + '\n')
            if (uploaded.length % 10 === 0 || uploaded.length === staging.releaseAssets.length) console.log(`Uploaded ${uploaded.length}/${staging.releaseAssets.length}`)
        }
    }
    const uploads = await Promise.allSettled([uploadWorker(), uploadWorker(), uploadWorker(), uploadWorker()])
    const failed = uploads.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
    assert.equal(uploaded.length, staging.releaseAssets.length)
    if (release.draft) release = await request(api + '/releases/' + release.id, jsonRequest('PATCH', { draft: false, make_latest: 'false' }))
    // Refresh public asset URLs after publishing; draft URLs contain untagged IDs.
    release = await request(api + '/releases/tags/' + expectedTag)
    assert(!release.draft)
    assert.equal(release.html_url, `https://github.com/Katozarasi/KTZ-Launcher/releases/tag/${expectedTag}`)
    for (const item of uploaded) item.url = `https://github.com/Katozarasi/KTZ-Launcher/releases/download/${expectedTag}/${item.name}`
    const progressPath = path.join(output, 'public-download-progress.json')
    const previous = fs.existsSync(progressPath) ? JSON.parse(fs.readFileSync(progressPath, 'utf8')) : { verified: [] }
    const verified = []
    let cursor = 0
    async function verifyWorker() {
        while (cursor < uploaded.length) {
            const item = uploaded[cursor++]
            const cached = previous.verified.find(record => record.url === item.url && record.sha256 === item.sha256 && record.size === item.size)
            if (!cached) {
                for (let attempt = 0; attempt < 4; attempt++) {
                    try {
                        const response = await fetch(item.url, { signal: AbortSignal.timeout(10 * 60 * 1000), headers: { 'User-Agent': 'KTZ-KAO-Client-Download-Verification' } })
                        assert(response.ok, `Public download ${response.status}: ${item.name}`)
                        const digest = crypto.createHash('sha256')
                        let size = 0
                        for await (const chunk of response.body) { digest.update(chunk); size += chunk.length }
                        assert.equal(size, item.size)
                        assert.equal(digest.digest('hex'), item.sha256)
                        break
                    } catch (error) {
                        if (attempt === 3) throw error
                        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
                    }
                }
            }
            verified.push(item)
            fs.writeFileSync(progressPath, JSON.stringify({ verified }, null, 2) + '\n')
            if (verified.length % 10 === 0 || verified.length === uploaded.length) console.log(`Public downloads verified ${verified.length}/${uploaded.length}`)
        }
    }
    const downloads = await Promise.allSettled([verifyWorker(), verifyWorker(), verifyWorker()])
    const downloadFailure = downloads.find(result => result.status === 'rejected')
    if (downloadFailure) throw downloadFailure.reason
    const latestAfter = await request(api + '/releases/latest')
    assert.equal(latestAfter.id, latestBefore.id, 'Launcher latest release changed')
    const result = { status: 'ASSETS_PUBLISHED_AND_PUBLIC_DOWNLOAD_HASH_VERIFIED', release: release.html_url,
        releaseId: release.id, releaseTag: expectedTag, assets: verified.length,
        totalBytes: verified.reduce((sum, asset) => sum + asset.size, 0),
        launcherLatestUnchanged: latestAfter.tag_name, distributionPublished: false, verified }
    fs.writeFileSync(path.join(output, 'publication-assets.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify({ ...result, verified: undefined }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
