// Minecraft account cosmetics. No tokens, local paths or response bodies are logged.
const https = require('node:https')
const crypto = require('node:crypto')
const API = 'https://api.minecraftservices.com/minecraft/profile'
const MAX_PNG_BYTES = 1024 * 1024

class SkinError extends Error {
    constructor(code){ super(code); this.name = 'SkinError'; this.code = code }
}

function decodePNG(buffer){
    const image = require('electron').nativeImage.createFromBuffer(buffer)
    if(image.isEmpty()) throw new SkinError('INVALID_PNG')
    return image.getSize()
}

function validateSkinPNG(buffer, decode = decodePNG){
    if(!Buffer.isBuffer(buffer) || buffer.length > MAX_PNG_BYTES) throw new SkinError('FILE_TOO_LARGE')
    if(buffer.length < 33 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new SkinError('INVALID_PNG')
    if(buffer.readUInt32BE(16) !== 64 || buffer.readUInt32BE(20) !== 64) throw new SkinError('INVALID_SIZE')
    try {
        const size = decode(buffer)
        if(size.width !== 64 || size.height !== 64) throw new Error('Invalid size')
    } catch(_err) { throw new SkinError('INVALID_PNG') }
    return buffer
}

function textureURL(value){
    try {
        const url = new URL(value)
        if(!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'textures.minecraft.net' || url.port || url.username || url.password || !/^\/texture\/[a-f0-9]{32,64}$/i.test(url.pathname) || url.search || url.hash) return null
        url.protocol = 'https:'
        return url.href
    } catch(_err) { return null }
}

function request(url, { method = 'GET', headers = {}, body } = {}){
    return new Promise((resolve, reject) => {
        const fail = () => reject(new SkinError('NETWORK'))
        const req = https.request(url, { method, headers }, res => {
            const chunks = []
            let length = 0
            res.on('data', chunk => {
                length += chunk.length
                if(length > MAX_PNG_BYTES) { res.destroy(); req.destroy(); fail() }
                else chunks.push(chunk)
            })
            res.on('error', fail)
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
        })
        // Absolute deadline; redirects/retries are intentionally not followed.
        const deadline = setTimeout(() => { req.destroy(); fail() }, 20000)
        req.once('close', () => clearTimeout(deadline))
        req.on('error', fail)
        req.end(body)
    })
}

function normalizeProfile(value, uuid){
    if(!value || value.id !== uuid || typeof value.name !== 'string' || !Array.isArray(value.skins) || !Array.isArray(value.capes)) throw new SkinError('INVALID_PROFILE')
    const clean = item => ({ id: String(item.id || ''), url: textureURL(item.url), active: item.state === 'ACTIVE' })
    return {
        id: value.id, name: value.name.slice(0, 32),
        skins: value.skins.slice(0, 20).map(item => ({ ...clean(item), variant: item.variant === 'SLIM' ? 'slim' : 'classic' })),
        capes: value.capes.slice(0, 100).filter(item => /^[a-f0-9-]{32,36}$/i.test(item.id)).map(item => ({ ...clean(item), alias: String(item.alias || 'Cape').slice(0, 80) }))
    }
}

function createSkinManager({ getAccount, validateAccount, transport = request, decode = decodePNG, isGameBusy = () => false }){
    let locked = false
    function account(uuid){
        const a = getAccount()
        if(!a || a.type !== 'microsoft' || !a.accessToken) throw new SkinError('LOGIN_REQUIRED')
        if(a.uuid !== uuid) throw new SkinError('ACCOUNT_CHANGED')
        return a
    }
    async function api(uuid, suffix = '', method = 'GET', body, contentType){
        const a = account(uuid)
        if(method !== 'GET' && isGameBusy()) throw new SkinError('GAME_RUNNING')
        const headers = { Authorization: `Bearer ${a.accessToken}`, Accept: 'application/json' }
        if(body){ headers['Content-Type'] = contentType; headers['Content-Length'] = body.length }
        let res
        try { res = await transport(API + suffix, { method, headers, body }) }
        catch(_err) { throw new SkinError('NETWORK') }
        account(uuid)
        if(res.status === 401) throw new SkinError('LOGIN_REQUIRED')
        if(res.status === 403) throw new SkinError('FORBIDDEN')
        if(res.status === 404) throw new SkinError('NO_PROFILE')
        if(res.status === 429) throw new SkinError('RATE_LIMIT')
        if(res.status >= 500) throw new SkinError('UNAVAILABLE')
        if(res.status < 200 || res.status >= 300) throw new SkinError('REJECTED')
        return res
    }
    async function profile(uuid){
        const res = await api(uuid)
        let value
        try { value = JSON.parse(res.body.toString('utf8')) }
        catch(_err) { throw new SkinError('INVALID_PROFILE') }
        return normalizeProfile(value, uuid)
    }
    async function exclusive(uuid, action, mutation = false){
        if(locked) throw new SkinError('BUSY')
        locked = true
        try {
            account(uuid)
            if(mutation && isGameBusy()) throw new SkinError('GAME_RUNNING')
            let valid = false
            try { valid = await validateAccount() } catch(_err) { /* Never expose auth error details. */ }
            if(!valid) throw new SkinError('LOGIN_REQUIRED')
            account(uuid)
            return await action()
        } finally { locked = false }
    }
    async function upload(uuid, buffer, variant){
        if(!['classic', 'slim'].includes(variant)) throw new SkinError('INVALID_VARIANT')
        validateSkinPNG(buffer, decode)
        return exclusive(uuid, async () => {
            const boundary = 'KTZSkin' + crypto.randomBytes(18).toString('hex')
            const body = Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`),
                buffer, Buffer.from(`\r\n--${boundary}--\r\n`)
            ])
            await api(uuid, '/skins', 'POST', body, `multipart/form-data; boundary=${boundary}`)
        }, true)
    }
    async function reset(uuid){
        return exclusive(uuid, () => api(uuid, '/skins/active', 'DELETE').then(() => undefined), true)
    }
    async function setCape(uuid, capeId){
        return exclusive(uuid, async () => {
            // Verify ownership from the API, not a caller-provided list.
            const current = await profile(uuid)
            if(capeId !== null && !current.capes.some(cape => cape.id === capeId)) throw new SkinError('CAPE_NOT_OWNED')
            const body = capeId === null ? undefined : Buffer.from(JSON.stringify({ capeId }))
            await api(uuid, '/capes/active', capeId === null ? 'DELETE' : 'PUT', body, 'application/json')
        }, true)
    }
    async function texture(value){
        const url = textureURL(value)
        if(!url) throw new SkinError('INVALID_TEXTURE')
        let res
        try { res = await transport(url) } catch(_err) { throw new SkinError('NETWORK') }
        if(res.status !== 200 || res.body.length > MAX_PNG_BYTES || res.body.length < 24 || !res.body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new SkinError('INVALID_TEXTURE')
        const w = res.body.readUInt32BE(16), h = res.body.readUInt32BE(20)
        if(w !== 64 || ![32, 64].includes(h)) throw new SkinError('INVALID_TEXTURE')
        return `data:image/png;base64,${res.body.toString('base64')}`
    }
    return { getProfile: uuid => exclusive(uuid, () => profile(uuid)), upload, reset, setCape, texture }
}

module.exports = { createSkinManager, validateSkinPNG, textureURL, SkinError, MAX_PNG_BYTES }
