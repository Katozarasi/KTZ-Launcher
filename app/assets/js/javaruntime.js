const { latestOpenJDK, extractJdk, ensureJavaDirIsRoot } = require('helios-core/java')
const { downloadFile } = require('helios-core/dl')
const { validateLocalFile } = require('helios-core/common')
const { validateJvm } = require('./javadiscovery')

function applyMinecraftJavaRequirements(distribution) {
    for(const server of distribution?.servers || []) {
        // Helios 2.x predates year-based releases and otherwise suggests Java 21.
        // Keep older Minecraft instances on their existing Java configuration.
        if(/^26\.\d+(?:\.|$|-)/.test(server.rawServer.minecraftVersion)) {
            server.effectiveJavaOptions = {
                ...server.effectiveJavaOptions,
                supported: '25.x',
                suggestedMajor: 25
            }
        }
    }
    return distribution
}

async function installJavaRuntime(options, dataDirectory, progress = () => {}, dependencies = {}) {
    const api = { latestOpenJDK, downloadFile, validateLocalFile, extractJdk, validateJvm, ...dependencies }
    const asset = await api.latestOpenJDK(options.suggestedMajor, dataDirectory, options.distribution)
    if(!asset) throw new Error(`Java ${options.suggestedMajor} 다운로드 정보를 찾을 수 없습니다.`)
    progress('download', 0)
    await api.downloadFile(asset.url, asset.path, ({ transferred }) => {
        progress('download', asset.size > 0 ? Math.min(100, Math.trunc(transferred / asset.size * 100)) : 0)
    })
    // An equal-sized corrupt download must never be extracted or selected.
    if(!await api.validateLocalFile(asset.path, asset.algo, asset.hash)) {
        throw new Error('Java 설치 파일 검증에 실패했습니다. 다시 시도해 주세요.')
    }
    progress('extract', 100)
    const executable = await api.extractJdk(asset.path)
    if(!executable || !await api.validateJvm(ensureJavaDirIsRoot(executable), options.supported)) {
        throw new Error(`설치한 Java가 필요한 버전(${options.supported})과 일치하지 않습니다.`)
    }
    return executable
}

module.exports = { applyMinecraftJavaRequirements, installJavaRuntime }
