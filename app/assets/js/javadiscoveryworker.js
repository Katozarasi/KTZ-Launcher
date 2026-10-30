const {
    DirectoryBasedJavaDiscoverer,
    discoverBestJvmInstallation,
    filterApplicableJavaPaths,
    getLauncherRuntimeDir,
    rankApplicableJvms,
    resolveJvmSettings,
    validateSelectedJvm
} = require('helios-core/java')

async function discoverPreferredJvm(dataDir, supported) {
    // A launcher-managed runtime does not need a scan of every Windows drive.
    const paths = await new DirectoryBasedJavaDiscoverer([getLauncherRuntimeDir(dataDir)]).discover()
    const candidates = filterApplicableJavaPaths(await resolveJvmSettings(paths), supported)
    rankApplicableJvms(candidates)
    return candidates[0] || await discoverBestJvmInstallation(dataDir, supported)
}

process.once('message', async request => {
    try {
        const details = request.action === 'validate'
            ? await validateSelectedJvm(request.root, request.supported)
            : await discoverPreferredJvm(request.dataDir, request.supported)
        process.send({ details }, () => process.exit(0))
    } catch(_error) {
        process.send({ error: 'Unable to inspect Java installations' }, () => process.exit(1))
    }
})
