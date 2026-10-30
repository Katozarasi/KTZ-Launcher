const assert = require('assert/strict')
const fs = require('fs/promises')
const path = require('path')
const appRoot = process.env.KTZ_RUNTIME_APP_ROOT || path.join(__dirname, '..')
const ConfiguredDistributionAPI = require(path.join(appRoot, 'app/assets/js/configureddistribution'))
const { runJvmWorker } = require(path.join(appRoot, 'app/assets/js/javadiscovery'))

async function main() {
    const root = path.join('C:\\codex\\Temp', `ktz-runtime-regression-${process.pid}`)
    await fs.mkdir(root, { recursive: true })
    const raw = { servers: [{
        id: 'test', name: 'Test', address: 'localhost', minecraftVersion: '1.20.1',
        modules: [
            { id: 'config', type: 'File', artifact: { path: 'config/example.toml' } },
            { id: 'org.test:library:1.0', type: 'Library', artifact: {} }
        ]
    }] }
    let location = 'before'
    const api = new ConfiguredDistributionAPI(root, () => ({
        commonDir: path.join(root, location, 'common'),
        instanceDir: path.join(root, location, 'instances')
    }), 'https://invalid.example/distribution.json', true)
    api.loadDistribution = async () => raw
    api._loadDistributionNullable = async () => null
    const old = await api.getDistribution()
    assert(old.getMainServer().modules[0].getPath().includes('before'))
    location = 'after'
    const offline = await api.refreshDistributionOrFallback()
    assert.equal(offline.getMainServer().modules[0].getPath(), path.join(root, 'after', 'instances', 'test', 'config', 'example.toml'))
    assert.equal(offline.getMainServer().modules[1].getPath(), path.join(root, 'after', 'common', 'libraries', 'org', 'test', 'library', '1.0', 'library-1.0.jar'))
    location = 'third'
    assert((await api.getDistributionLocalLoadOnly()).getMainServer().modules[0].getPath().includes('third'))
    location = 'fourth'
    assert((await api.getDistribution()).getMainServer().modules[0].getPath().includes('fourth'))
    console.log('PASS: cached and offline distribution paths follow changed data directory')

    const workerPath = path.join(root, 'hung-worker.cjs')
    const pidPath = path.join(root, 'probe-pids.json')
    await fs.writeFile(workerPath, `
const { spawn } = require('child_process')
const fs = require('fs')
process.once('message', request => {
    const probe = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' })
    fs.writeFileSync(request.pidPath, JSON.stringify([process.pid, probe.pid]))
    setInterval(() => {}, 1000)
})
`)
    const started = Date.now()
    await assert.rejects(runJvmWorker({ pidPath }, { workerPath, timeoutMs: 2000 }), { code: 'JAVA_SCAN_TIMEOUT' })
    assert(Date.now() - started < 8000)
    const pids = JSON.parse(await fs.readFile(pidPath, 'utf8'))
    const running = pid => {
        try { process.kill(pid, 0); return true } catch(_error) { return false }
    }
    for(let i = 0; i < 60 && pids.some(running); i++) await new Promise(resolve => setTimeout(resolve, 100))
    assert(pids.every(pid => !running(pid)), 'Timed-out worker and its probe child must both exit')
    console.log('PASS: timeout returns promptly and terminates only the discovery worker tree')

    const runtime = process.env.KTZ_TEST_RUNTIME
    if(runtime) {
        const details = await runJvmWorker({ action: 'discover', dataDir: runtime, supported: '21.x' })
        assert.equal(details.semver.major, 21)
        assert(details.path.startsWith(path.join(runtime, 'runtime')))
        const invalid = await runJvmWorker({ action: 'validate', root: details.path, supported: '99.x' })
        assert.equal(invalid, null)
        console.log('PASS: installed managed Java 21 is selected and incompatible Java is rejected')
    }
    console.log(JSON.stringify({ passed: true, scratch: root }))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
