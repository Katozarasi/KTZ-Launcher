// Fail before publishing if the installer and updater metadata do not match.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const yaml = require('js-yaml')
const asar = require('@electron/asar')
const version = require('../package.json').version
const directory = path.resolve(process.argv[2] || 'dist')

async function hash(file, algorithm, encoding){
    const digest = crypto.createHash(algorithm)
    for await(const chunk of fs.createReadStream(file)) digest.update(chunk)
    return digest.digest(encoding)
}
async function main(){
    assert.match(version, /^\d+\.\d+\.\d+$/, 'Stable version required')
    const installerName = `KTZ-Launcher-setup-${version}.exe`
    const installer = path.join(directory, installerName)
    const portable = path.join(directory, `KTZ-Launcher-portable-${version}.zip`)
    const manifestPath = path.join(directory, 'latest.yml')
    const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.version, version)
    const entry = manifest.files.find(file => file.url === installerName)
    assert.ok(entry, 'Installer missing from latest.yml')
    assert.equal(manifest.path, installerName)
    const sha512 = await hash(installer, 'sha512', 'base64')
    assert.equal(entry.sha512, sha512)
    assert.equal(manifest.sha512, sha512)
    assert.equal(entry.size, fs.statSync(installer).size)
    for(const file of [installer, installer + '.blockmap', portable]) assert.ok(fs.statSync(file).size > 1000)
    const archive = path.join(directory, 'win-unpacked/resources/app.asar')
    const files = asar.listPackage(archive).map(file => file.split(path.sep).join('/'))
    for(const required of ['/app/launcherShell.ejs', '/app/skins.ejs', '/app/assets/js/scripts/ktzSkins.js', '/app/assets/js/skinmanager.js']) assert.ok(files.includes(required), `Missing ${required}`)
    for(const privateRoot of ['/tools', '/admin', '/.codex-remote-attachments', '/.github']) assert.ok(!files.some(file => file === privateRoot || file.startsWith(privateRoot + '/')), `Private files packaged: ${privateRoot}`)
    assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version)
    const update = yaml.load(fs.readFileSync(path.join(directory, 'win-unpacked/resources/app-update.yml'), 'utf8'))
    assert.equal(update.provider, 'github')
    assert.equal(update.owner, 'Katozarasi')
    assert.equal(update.repo, 'KTZ-Launcher')
    const result = { version, installer: installerName, installerSize: entry.size, installerSha256: await hash(installer, 'sha256', 'hex'), portableSha256: await hash(portable, 'sha256', 'hex'), updaterHashMatched: true, privateFilesExcluded: true }
    console.log(JSON.stringify(result, null, 2))
    fs.writeFileSync(path.join(directory, 'release-verification.json'), JSON.stringify(result, null, 2) + '\n')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
