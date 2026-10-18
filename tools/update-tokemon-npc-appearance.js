const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),AdmZip=require('adm-zip')
const root=path.resolve(__dirname,'..'),work='C:/codex/Builds/KTZ-Tokemon-NpcAppearance-20261019',build='C:/codex/Builds/Tokemon-NpcAppearance-20261019'
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=(b,alg='sha256')=>crypto.createHash(alg).update(b).digest('hex'),write=(p,j)=>fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')
const candidate=read(build+'/candidate.json'),baseline=read(build+'/baseline.json')
const oldDist=read(root+'/distribution.json'),oldInventory=read(root+'/docs/packs/tokemon-files.json'),next=structuredClone(oldDist),inv=structuredClone(oldInventory),server=next.servers.find(s=>s.id==='tokemon'),old=oldDist.servers.find(s=>s.id==='tokemon')
assert.equal(old.version,'2026.10.18.23','Concurrent launcher update: inspect before staging')
const changes=[]
for(const [id,jar,version]of [['tokemon_shop',candidate.shopJar,'0.4.4'],['tokemon_dialogue',candidate.dialogueJar,'0.2.0']]){
 const b=fs.readFileSync(jar),zip=new AdmZip(b),meta=JSON.parse(zip.readAsText('fabric.mod.json'))
 assert.equal(meta.id,id);assert.equal(meta.version,version);assert.ok(!zip.getEntries().some(e=>e.entryName.startsWith('dev/tokemon/dialogueqa/')))
 const relative='files/mods/tokemon/'+path.basename(jar),previous=inv.mods.find(m=>m.id===id);assert.ok(previous);assert.ok(!fs.existsSync(root+'/'+relative),'Preserve published artifact')
 const record={file:path.basename(jar),id,version,size:b.length,md5:hash(b,'md5'),sha256:hash(b),sha512:hash(b,'sha512'),url:'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'+relative,custom:true}
 const index=server.modules.findIndex(m=>m.id.startsWith('ktz.tokemon:'+id+':'));assert.ok(index>=0)
 server.modules[index]={id:'ktz.tokemon:'+id+':'+record.sha256.slice(0,12),name:'토켓몬 '+(id==='tokemon_shop'?'상점':'NPC 대화')+' '+version,type:'FabricMod',required:{value:true},artifact:{size:record.size,MD5:record.md5,url:record.url}}
 inv.mods=inv.mods.map(m=>m.id===id?record:m);changes.push({relative,record,source:jar,previous})
}
server.version='2026.10.19.1'
const affected=m=>changes.some(c=>m.id.startsWith('ktz.tokemon:'+c.record.id+':'))
assert.deepEqual(old.modules.filter(m=>!affected(m)),server.modules.filter(m=>!affected(m)))
assert.deepEqual({...old,modules:[],version:''},{...server,modules:[],version:''})
assert.deepEqual(oldDist.servers.filter(s=>s.id!=='tokemon'),next.servers.filter(s=>s.id!=='tokemon'))
assert.deepEqual(oldInventory.mods.filter(m=>!changes.some(c=>c.record.id===m.id)),inv.mods.filter(m=>!changes.some(c=>c.record.id===m.id)))
assert.equal(inv.modCount,65);assert.equal(inv.mods.length,65)
const backup=work+'/backup';assert.ok(!fs.existsSync(backup),'Preserve prior staging backup');fs.mkdirSync(backup,{recursive:true})
for(const f of ['distribution.json','docs/packs/tokemon-files.json','admin/servers.json']){fs.mkdirSync(path.dirname(backup+'/'+f),{recursive:true});fs.copyFileSync(root+'/'+f,backup+'/'+f,fs.constants.COPYFILE_EXCL)}
const user='C:/Users/nabar/AppData/Roaming/KTZ Launcher',cfg=read(user+'/config.json'),data=cfg.settings.launcher.dataDirectory,instance=data+'/instances/tokemon'
const protectedFiles=[]
for(const p of [user+'/config.json',instance+'/options.txt',instance+'/servers.dat'])if(fs.existsSync(p)){const dest=backup+'/private/'+path.basename(p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p,dest);protectedFiles.push({file:p,sha256:hash(fs.readFileSync(p)),backup:dest})}
for(const c of changes)fs.copyFileSync(c.source,root+'/'+c.relative,fs.constants.COPYFILE_EXCL)
write(root+'/distribution.json',next);write(root+'/docs/packs/tokemon-files.json',inv)
write(work+'/staging.json',{version:server.version,oldVersion:old.version,modCount:65,changes,backup,instance,data,protectedFiles,otherModsPreserved:63,otherServersPreserved:true,productionTrainerJarExpected:baseline.mods.find(m=>m.name.includes('trainer')).sha256})
fs.writeFileSync(root+'/docs/packs/tokemon-'+server.version+'.txt','Tokemon '+server.version+'\n\nApproved portraits and skins for eight gyms and twelve shop NPCs. Native shop category IDs, prices, balances and trainer teams are preserved. Gym conversations delegate to the existing NPC challenge handler. Server-provided portraits keep original assets archived.\n\nShop 0.4.4 / NPC Dialogue 0.2.0. The selected Valerie skin is awaiting its unavailable source PNG; its approved portrait is included and no substitute skin is installed.\n\nClose Minecraft and press Tokemon PLAY in KTZ to load these updates. Operational installation and native QA are recorded separately; no authenticated production player session is claimed.\n')
console.log(JSON.stringify({version:server.version,changes:changes.map(c=>({id:c.record.id,sha256:c.record.sha256})),otherModsPreserved:63,work}))
