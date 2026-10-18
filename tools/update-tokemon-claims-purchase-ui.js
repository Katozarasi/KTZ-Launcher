const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const AdmZip=require('adm-zip')
const root='C:/codex/Projects/KTZ-Launcher',work='C:/codex/Builds/KTZ-Tokemon-ClaimsPurchaseUI-20261018'
const source='C:/codex/Builds/Tokemon-Claims-20261018/build/libs/tokemon-claims-0.3.0.jar'
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''))
const hash=(bytes,algorithm='sha256')=>crypto.createHash(algorithm).update(bytes).digest('hex')
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n')
const bytes=fs.readFileSync(source),sha=hash(bytes),zip=new AdmZip(bytes),meta=JSON.parse(zip.readAsText('fabric.mod.json'))
assert.equal(meta.id,'tokemon_claims');assert.equal(meta.version,'0.3.0');assert.equal(meta.environment,'*')
assert.ok(!zip.getEntries().some(e=>/clientqa|ClaimsQa.class/.test(e.entryName)))
for(const [base,phases] of [['C:/codex/Builds/Tokemon-ClaimsQA-20261018/reports/',['phase1','phase2']],['C:/codex/Builds/Tokemon-ClaimsClientQA-20261018/reports/scenario-',['deed','shop','protection','borders','ui','purchase','reconnect']]])for(const phase of phases){const r=read(base+phase+'.json');assert.equal(r.status,'PASS',phase);assert.equal(r.candidateSha256,sha,phase)}
assert.ok(!fs.existsSync(work),'Preserve previous staging')
const distributionFile=root+'/distribution.json',inventoryFile=root+'/docs/packs/tokemon-files.json'
const dBytes=fs.readFileSync(distributionFile),iBytes=fs.readFileSync(inventoryFile),before=JSON.parse(dBytes),inventoryBefore=JSON.parse(iBytes)
const after=structuredClone(before),inventory=structuredClone(inventoryBefore),server=after.servers.find(s=>s.id==='tokemon'),old=before.servers.find(s=>s.id==='tokemon')
assert.equal(inventory.mods.find(m=>m.id==='tokemon_shop').version,'0.4.0','Use the new shop theme')
const previous=inventory.mods.find(m=>m.id==='tokemon_claims');assert.equal(previous.version,'0.2.0');const changed=m=>m.id.startsWith('ktz.tokemon:tokemon_claims:');assert.equal(server.modules.filter(changed).length,1)
const version=old.version.replace(/\d+$/,s=>String(Number(s)+1)),relative='files/mods/tokemon/tokemon-claims-0.3.0.jar'
const record={file:path.basename(relative),id:meta.id,version:meta.version,size:bytes.length,md5:hash(bytes,'md5'),sha256:sha,sha512:hash(bytes,'sha512'),url:'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'+relative,custom:true}
server.modules[server.modules.findIndex(changed)]={id:'ktz.tokemon:tokemon_claims:'+sha.slice(0,12),name:'tokemon_claims 0.3.0',type:'FabricMod',required:{value:true},artifact:{size:record.size,MD5:record.md5,url:record.url}}
server.version=version;inventory.mods=inventory.mods.map(m=>m.id==='tokemon_claims'?record:m);inventory.modCount=inventory.mods.length
assert.deepEqual(server.modules.filter(m=>!changed(m)),old.modules.filter(m=>!changed(m)));assert.deepEqual(after.servers.filter(s=>s.id!=='tokemon'),before.servers.filter(s=>s.id!=='tokemon'));assert.deepEqual(inventory.mods.filter(m=>m.id!=='tokemon_claims'),inventoryBefore.mods.filter(m=>m.id!=='tokemon_claims'))
const backup=work+'/backup';fs.mkdirSync(backup,{recursive:true})
for(const file of ['distribution.json','docs/packs/tokemon-files.json','admin/servers.json']){fs.mkdirSync(path.dirname(backup+'/'+file),{recursive:true});fs.copyFileSync(root+'/'+file,backup+'/'+file,fs.constants.COPYFILE_EXCL)}
const user='C:/Users/nabar/AppData/Roaming/KTZ Launcher',config=read(user+'/config.json'),instance=path.join(config.settings.launcher.dataDirectory,'instances/tokemon')
fs.mkdirSync(backup+'/private')
const protect=(files,prefix)=>files.filter(fs.existsSync).map((file,n)=>{const destination=backup+'/private/'+prefix+n+'-'+path.basename(file);fs.copyFileSync(file,destination,fs.constants.COPYFILE_EXCL);return {file,backup:destination,sha256:hash(fs.readFileSync(file))}})
const protectedFiles=protect([user+'/config.json',instance+'/options.txt'],'settings-'),untouchedRuntimeFiles=protect([user+'/distribution.json',instance+'/forgeMods.list'],'runtime-')
assert.equal(hash(fs.readFileSync(distributionFile)),hash(dBytes));assert.equal(hash(fs.readFileSync(inventoryFile)),hash(iBytes))
fs.copyFileSync(source,root+'/'+relative,fs.constants.COPYFILE_EXCL);write(distributionFile,after);write(inventoryFile,inventory)
write(work+'/staging.json',{createdAt:new Date().toISOString(),version,oldVersion:old.version,modCount:inventory.modCount,root,backup,instance,protectedFiles,untouchedRuntimeFiles,changes:[{relative,record,source,from:previous.version}],unchangedModCount:inventoryBefore.modCount-1,otherServersPreserved:true,otherModsPreserved:true,settingsAndJavaUnchanged:true})
fs.writeFileSync(root+'/docs/packs/tokemon-'+version+'.txt',`Tokemon pack ${version}\n\nLand purchase UI 0.3.0: right-clicking a chunk deed opens the Shop 0.4.0 style confirmation with coordinates, a 3x3 ownership map, one-deed cost and 30-second expiry. Boundary preview shows the actual world while retaining confirm/cancel buttons. Cancel, Escape, stale positions, changed main hand, forged sessions and repeated confirmations preserve the deed. A completed purchase opens land management. View owned chunks and coordinates, confirm shared build/use/all permissions or revocation, and toggle nearby boundaries for 30 seconds. One free chunk, at most nine chunks, and 100000 WON additional deeds are unchanged. Server-owned sessions, revisions and request IDs prevent stale or repeated edits. Existing world, player progress, shop prices and all other mods are preserved.\n\nClose Minecraft and PLAY Tokemon in KTZ to load the new client. Isolated actual two-client testing uses offline QA identities; authenticated production gameplay is not claimed.\n\nClaims SHA256 ${sha}\n`)
console.log(JSON.stringify({version,modCount:inventory.modCount,sha256:sha,work}))
