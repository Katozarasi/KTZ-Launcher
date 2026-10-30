const ConfiguredDistributionAPI = require('./configureddistribution')

const ConfigManager = require('./configmanager')

exports.REMOTE_DISTRO_URL = 'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/distribution.json'

const api = new ConfiguredDistributionAPI(
    ConfigManager.getLauncherDirectory(),
    () => ({
        commonDir: ConfigManager.getCommonDirectory(),
        instanceDir: ConfigManager.getInstanceDirectory()
    }),
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api
