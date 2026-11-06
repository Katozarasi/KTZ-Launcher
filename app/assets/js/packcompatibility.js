function assertPackCompatibility(manifest, server) {
    if(!server) return
    const matches = manifest.minecraftVersion === server.minecraftVersion &&
        manifest.loader?.type === server.ktz?.loader &&
        manifest.loader?.version === server.ktz?.loaderVersion
    if(!matches) {
        throw new Error(`서버 설정과 클라이언트팩 버전이 다릅니다. 서버: ${server.minecraftVersion} / ${server.ktz?.loaderVersion}, 팩: ${manifest.minecraftVersion} / ${manifest.loader?.version}. 런처를 다시 시작한 후 확인해 주세요.`)
    }
}

module.exports = { assertPackCompatibility }
