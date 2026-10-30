const { DistributionAPI, HeliosDistribution } = require('helios-core/common')

// Helios caches resolved module paths. Rebuild that cache when the user
// changes the data directory, including when a refresh falls back offline.
class ConfiguredDistributionAPI extends DistributionAPI {
    constructor(launcherDirectory, resolveDirectories, remoteUrl, devMode) {
        super(launcherDirectory, null, null, remoteUrl, devMode)
        this.resolveDirectories = resolveDirectories
    }

    syncDirectories() {
        const { commonDir, instanceDir } = this.resolveDirectories()
        if(this.commonDir === commonDir && this.instanceDir === instanceDir) return
        this.commonDir = commonDir
        this.instanceDir = instanceDir
        if(this.rawDistribution != null) {
            this.distribution = new HeliosDistribution(this.rawDistribution, commonDir, instanceDir)
        }
    }

    async getDistribution() {
        this.syncDirectories()
        return super.getDistribution()
    }

    async getDistributionLocalLoadOnly() {
        this.syncDirectories()
        return super.getDistributionLocalLoadOnly()
    }

    async refreshDistributionOrFallback() {
        this.syncDirectories()
        return super.refreshDistributionOrFallback()
    }
}

module.exports = ConfiguredDistributionAPI
