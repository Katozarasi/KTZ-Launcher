const assert = require('assert/strict')
const fs = require('fs-extra')
const path = require('path')
const { HeliosDistribution } = require('helios-core/common')
const { applyMinecraftJavaRequirements, installJavaRuntime } = require('../app/assets/js/javaruntime')
const { assertPackCompatibility } = require('../app/assets/js/packcompatibility')
const ConfiguredDistributionAPI = require('../app/assets/js/configureddistribution')

async function main() {
    const root = fs.mkdtempSync('C:\\codex\\Temp\\ktz-java25-')
    const raw = { servers: ['1.21.1', '1.21.4', '26.1.2', '26.3'].map(version => ({
        id: version, name: version, address: 'localhost', minecraftVersion: version, modules: [],
        javaOptions: { suggestedMajor: 21, supported: '21.x' }
    })) }
    const distro = applyMinecraftJavaRequirements(new HeliosDistribution(raw, root, root))
    for(const version of ['1.21.1', '1.21.4']) assert.equal(distro.getServerById(version).effectiveJavaOptions.suggestedMajor, 21)
    for(const version of ['26.1.2', '26.3']) {
        assert.equal(distro.getServerById(version).effectiveJavaOptions.suggestedMajor, 25)
        assert.equal(distro.getServerById(version).effectiveJavaOptions.supported, '25.x')
    }
    const api = new ConfiguredDistributionAPI(root, () => ({ commonDir: root, instanceDir: root }), 'https://example.invalid', true)
    api.loadDistribution = async () => raw
    api._loadDistributionNullable = async () => null
    for(const d of [await api.getDistribution(), await api.refreshDistributionOrFallback(), await api.getDistributionLocalLoadOnly()]) {
        assert.equal(d.getServerById('26.3').effectiveJavaOptions.suggestedMajor, 25)
    }
    console.log('PASS: 26.x selects Java 25 online and offline; older instances retain Java 21')

    const asset = { url: 'https://example.invalid/jdk.zip', path: path.join(root, 'jdk.zip'), hash: 'expected', size: 8, algo: 'sha256' }
    let extracted = false
    const fake = {
        latestOpenJDK: async () => asset,
        downloadFile: async (_url, file, progress) => { fs.writeFileSync(file, 'bad-data'); progress({ transferred: 8 }) },
        validateLocalFile: async () => false,
        extractJdk: async () => { extracted = true; return path.join(root, 'jdk', 'bin', 'javaw.exe') },
        validateJvm: async () => null
    }
    const options = { suggestedMajor: 25, supported: '25.x' }
    await assert.rejects(installJavaRuntime(options, root, () => {}, fake), /검증/)
    assert.equal(extracted, false)
    fake.validateLocalFile = async () => true
    await assert.rejects(installJavaRuntime(options, root, () => {}, fake), /일치/)
    fake.validateJvm = async () => ({ semver: { major: 25 } })
    assert((await installJavaRuntime(options, root, () => {}, fake)).endsWith('javaw.exe'))
    console.log('PASS: equal-size corruption is rejected before extraction; wrong Java cannot be selected')

    const server = { minecraftVersion: '26.3', ktz: { loader: 'neoforge', loaderVersion: '26.3.0.101' } }
    assert.throws(() => assertPackCompatibility({ minecraftVersion: '1.21.4', loader: { type: 'neoforge', version: '21.4.157' } }, server), /버전/)
    assert.doesNotThrow(() => assertPackCompatibility({ minecraftVersion: '26.3', loader: { type: 'neoforge', version: '26.3.0.101' } }, server))
    console.log('PASS: pack/game/loader mismatch is rejected before installation')
    if(process.env.KTZ_VERIFY_JAVA_DOWNLOAD === '1') {
        const executable = await installJavaRuntime(options, root)
        console.log(JSON.stringify({ realJava25Install: true, executable }))
    }
    console.log(JSON.stringify({ passed: true, scratch: root }))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
