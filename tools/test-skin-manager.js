const assert = require('node:assert/strict')
const { createSkinManager, validateSkinPNG, textureURL } = require('../app/assets/js/skinmanager')
const { UUID, CAPES, png, texture, createFixture } = require('./skin-test-fixtures.cjs')
const { drawSkin, drawCape } = require('../app/assets/js/skinpreview')

async function main(){
    let account = { uuid: UUID, type: 'microsoft', accessToken: 'SYNTHETIC-TOKEN' }
    let valid = true, game = false
    const fixture = createFixture()
    const sent = []
    const manager = createSkinManager({
        getAccount: () => account, validateAccount: async () => valid, isGameBusy: () => game,
        decode: () => ({ width: 64, height: 64 }),
        transport: (url, options) => { sent.push({ url, options }); return fixture.transport(url, options) }
    })
    const checks = []
    async function check(name, action){ await action(); checks.push(name) }
    const rejects = (action, code) => assert.rejects(action, err => err.code === code)
    await check('Profile belongs to selected account', async () => assert.equal((await manager.getProfile(UUID)).id, UUID))
    await check('Only Minecraft texture URLs accepted', () => {
        assert.equal(textureURL(texture('a').replace('https:', 'http:')), texture('a'))
        for(const url of ['file:///C:/secret', 'https://textures.minecraft.net.attacker.test/texture/'+'a'.repeat(64), texture('a')+'?x=1', texture('a').replace('textures.', 'user:pass@textures.'), 'https://127.0.0.1/']) assert.equal(textureURL(url), null)
    })
    await check('Texture download receives no credentials', async () => { await manager.texture(texture('a')); assert.equal(sent.at(-1).options, undefined) })
    await check('Upload sends real PNG as multipart with slim model', async () => {
        const data = png()
        await manager.upload(UUID, data, 'slim')
        const { url, options } = sent.at(-1)
        assert.equal(url, 'https://api.minecraftservices.com/minecraft/profile/skins')
        assert.equal(options.method, 'POST')
        assert.match(options.headers['Content-Type'], /^multipart\/form-data; boundary=KTZSkin/)
        assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC-TOKEN')
        assert.ok(options.body.includes(data))
        assert.ok(options.body.includes(Buffer.from('\r\nslim\r\n')))
    })
    await check('Rejects malformed, oversized and wrong-dimension PNG', async () => {
        await rejects(() => manager.upload(UUID, Buffer.from('bad'), 'classic'), 'INVALID_PNG')
        await rejects(() => manager.upload(UUID, Buffer.alloc(1024*1024+1), 'classic'), 'FILE_TOO_LARGE')
        await rejects(() => manager.upload(UUID, png(32,32), 'classic'), 'INVALID_SIZE')
        assert.throws(() => validateSkinPNG(png(), () => { throw new Error('decoder') }), e => e.code === 'INVALID_PNG')
        await rejects(() => manager.upload(UUID, png(), 'unknown'), 'INVALID_VARIANT')
    })
    await check('Cape ownership checked before mutation', async () => {
        const count = sent.length
        await rejects(() => manager.setCape(UUID, '33333333-3333-3333-3333-333333333333'), 'CAPE_NOT_OWNED')
        assert.ok(sent.slice(count).every(c => c.options.method === 'GET'))
        await manager.setCape(UUID, CAPES[1])
        assert.equal(sent.at(-1).options.method, 'PUT')
        assert.deepEqual(JSON.parse(sent.at(-1).options.body), { capeId: CAPES[1] })
    })
    await check('Hide cape and reset skin use separate endpoints', async () => {
        await manager.setCape(UUID, null)
        assert.ok(sent.at(-1).url.endsWith('/capes/active'))
        assert.equal(sent.at(-1).options.method, 'DELETE')
        await manager.reset(UUID)
        assert.ok(sent.at(-1).url.endsWith('/skins/active'))
        assert.equal(sent.at(-1).options.method, 'DELETE')
    })
    await check('Mutations blocked during game preparation', async () => {
        game = true
        const count = sent.length
        await rejects(() => manager.reset(UUID), 'GAME_RUNNING')
        assert.equal(sent.length, count)
        game = false
    })
    await check('Authentication and account mismatch stop before network', async () => {
        const count = sent.length
        valid = false
        await rejects(() => manager.getProfile(UUID), 'LOGIN_REQUIRED')
        valid = true
        await rejects(() => manager.getProfile('other'), 'ACCOUNT_CHANGED')
        assert.equal(sent.length, count)
    })
    await check('API errors are safe and requests are not retried', async () => {
        for(const [status, code] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[404,'NO_PROFILE'],[429,'RATE_LIMIT'],[500,'UNAVAILABLE'],[400,'REJECTED'],[302,'REJECTED']]){
            fixture.fail(status)
            const count = sent.length
            await rejects(() => manager.getProfile(UUID), code)
            assert.equal(sent.length, count+1)
        }
        fixture.fail(200)
    })
    await check('Concurrent mutations are blocked', async () => {
        let resume
        fixture.delay(new Promise(resolve => { resume = resolve }))
        const first = manager.reset(UUID)
        await rejects(() => manager.reset(UUID), 'BUSY')
        resume(); await first; fixture.delay(null)
    })
    await check('Account switch during validation sends no request', async () => {
        const changed = createSkinManager({ getAccount: () => account, validateAccount: async () => { account = { ...account, uuid: 'other' }; return true }, transport: fixture.transport })
        const count = fixture.calls.length
        await rejects(() => changed.reset(UUID), 'ACCOUNT_CHANGED')
        assert.equal(fixture.calls.length, count)
        account = { ...account, uuid: UUID }
    })
    await check('Mismatched server profile is rejected', async () => {
        fixture.state.id = 'other'
        await rejects(() => manager.getProfile(UUID), 'INVALID_PROFILE')
        fixture.state.id = UUID
    })
    await check('Transport error cannot disclose token or response', async () => {
        const broken = createSkinManager({ getAccount: () => account, validateAccount: async () => true, transport: async () => { throw new Error('SYNTHETIC-TOKEN secret') } })
        await rejects(() => broken.reset(UUID), 'NETWORK')
    })
    await check('Front and back previews keep every UV rectangle inside the skin', () => {
        const calls = []
        const ctx = { clearRect(){}, save(){}, restore(){}, scale(){}, translate(){}, drawImage(...args){ calls.push(args) } }
        const canvas = { width: 128, height: 256, getContext: () => ctx }
        for(const model of ['classic', 'slim']) for(const back of [false, true]){
            calls.length = 0
            drawSkin(canvas, { naturalHeight: 64 }, model, back)
            assert.equal(calls.length, 12)
            for(const [, x, y, w, h] of calls){ assert.ok(x >= 0 && y >= 0 && x+w <= 64 && y+h <= 64) }
            assert.equal(calls[2][3], model === 'slim' ? 3 : 4)
            assert.equal(calls[0][1], back ? 24 : 8)
        }
        drawCape(canvas, { naturalHeight: 32 })
        assert.deepEqual(calls.at(-1).slice(1,5), [1,1,10,16])
    })
    console.log(JSON.stringify({ checks, count: checks.length, realAccountMutated: false }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
