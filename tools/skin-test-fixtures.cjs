// Synthetic pixel fixtures. No user's skin, account, tokens or capes are used.
const zlib = require('node:zlib')
const UUID = '00000000000000000000000000000000'
const CAPES = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
const texture = letter => `https://textures.minecraft.net/texture/${letter.repeat(64)}`
function crc32(data){
    let c = 0xffffffff
    for(const byte of data){ c ^= byte; for(let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0) }
    return (c^0xffffffff)>>>0
}
function png(width=64,height=64,cape=false){
    const rows=Buffer.alloc((width*4+1)*height)
    function rect(x,y,w,h,color){
        for(let dy=y;dy<Math.min(y+h,height);dy++) for(let dx=x;dx<Math.min(x+w,width);dx++){
            const at=dy*(width*4+1)+1+dx*4
            Buffer.from(color).copy(rows,at)
        }
    }
    if(cape){ rect(1,1,10,16,[104,128,232,255]);rect(4,4,4,8,[222,227,255,255]) }
    else {
        rect(0,0,32,16,[64,47,44,255]);rect(8,9,8,7,[204,157,117,255])
        rect(9,11,2,1,[245,246,244,255]);rect(13,11,2,1,[245,246,244,255]);rect(10,11,1,1,[39,49,68,255]);rect(13,11,1,1,[39,49,68,255]);rect(11,14,2,1,[114,68,54,255])
        rect(16,16,24,16,[70,98,186,255]);rect(20,20,8,2,[211,177,141,255]);rect(0,16,16,16,[40,54,85,255]);rect(16,48,16,16,[40,54,85,255])
        rect(40,16,16,16,[204,157,117,255]);rect(40,16,16,7,[70,98,186,255]);rect(32,48,16,16,[204,157,117,255]);rect(32,48,16,7,[70,98,186,255])
    }
    const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,c])}
    const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6
    return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
function createFixture(){
    const calls=[]
    let responseStatus=200, wait=null
    const state={ id:UUID,name:'KTZ_Traveler',skins:[{id:'skin-fixture',state:'ACTIVE',url:texture('a'),variant:'CLASSIC'}],capes:[{id:CAPES[0],state:'ACTIVE',url:texture('b'),alias:'Preview Blue'},{id:CAPES[1],state:'INACTIVE',url:texture('c'),alias:'Preview Violet'}] }
    async function transport(url,options={}){
        const method=options.method||'GET'
        // Keep credentials out of test diagnostics too.
        calls.push({url,method})
        if(wait) await wait
        if(url.startsWith('https://textures.minecraft.net/'))return{status:200,body:png(64,64,!url.endsWith('a'.repeat(64)))}
        if(responseStatus!==200)return{status:responseStatus,body:Buffer.from('synthetic service error')}
        if(method==='POST'){state.skins[0].variant=options.body.toString().includes('\r\nslim\r\n')?'SLIM':'CLASSIC'}
        if(method==='DELETE'&&url.endsWith('/skins/active'))state.skins=[]
        if(url.endsWith('/capes/active')){
            const id=method==='PUT'?JSON.parse(options.body).capeId:null
            state.capes.forEach(c=>{c.state=c.id===id?'ACTIVE':'INACTIVE'})
        }
        return{status:200,body:Buffer.from(JSON.stringify(state))}
    }
    return{transport,calls,state,png,fail:code=>{responseStatus=code},delay:value=>{wait=value}}
}
module.exports={UUID,CAPES,png,texture,createFixture}
