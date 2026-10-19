const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),AdmZip=require('adm-zip')
const root=path.resolve(__dirname,'..'),work='C:/codex/Builds/KTZ-Tokemon-PokemonBoxes-20261020'
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))
const hash=(data,algorithm='sha256')=>crypto.createHash(algorithm).update(data).digest('hex')
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n')
const checked=read('C:/codex/Projects/Tokemon/reports/pokemon-boxes-20261020/candidate.json')
assert.equal(checked.status,'QA_PASSED_READY_FOR_APPROVAL');assert.equal(checked.newbiePool,27);assert.equal(checked.devilPool,113)
assert(checked.nativeChecks>=483&&checked.restartChecks>=22&&checked.extraChecks>=11&&checked.nativeRendererVerified)
const bytes=fs.readFileSync(checked.jar),zip=new AdmZip(bytes),meta=JSON.parse(zip.readAsText('fabric.mod.json'))
assert.equal(hash(bytes),checked.sha256);assert.equal(meta.id,'tokemon_pokemon_boxes');assert.equal(meta.version,'0.1.1');assert.equal(meta.environment,'*');assert.equal(checked.itemStyle,'flat-128px')
assert(!zip.getEntries().some(e=>/pokemonboxesqa|PoolRulesTest|(^|\/)qa\//.test(e.entryName)))
for(const item of ['newbie_box','devil_box']){const model=JSON.parse(zip.readAsText('assets/tokemon_pokemon_boxes/models/item/'+item+'.json')),png=zip.readFile('assets/tokemon_pokemon_boxes/textures/item/'+item+'.png');assert.equal(model.parent,'minecraft:item/generated');assert.equal(model.elements,undefined);assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128)}
const files=['distribution.json','docs/packs/tokemon-files.json'],original=files.map(f=>fs.readFileSync(path.join(root,f)))
const before=JSON.parse(original[0]),inventoryBefore=JSON.parse(original[1]),distro=structuredClone(before),inventory=structuredClone(inventoryBefore)
const server=distro.servers.find(s=>s.id==='tokemon'),old=before.servers.find(s=>s.id==='tokemon')
assert.equal(old.version,'2026.10.19.6','Review a concurrent pack release');assert.equal(inventoryBefore.modCount,66);assert.equal(inventoryBefore.mods.length,66)
assert(!inventoryBefore.mods.some(m=>m.id===meta.id));assert(!old.modules.some(m=>m.id.startsWith('ktz.tokemon:'+meta.id+':')))
for(const id of ['tokemon_starterbox','tokemon_cards'])assert(inventoryBefore.mods.some(m=>m.id===id),'Existing required mod '+id)
const relative='files/mods/tokemon/'+path.basename(checked.jar),version='2026.10.20.1'
assert(!fs.existsSync(path.join(root,relative)),'Preserve existing release artifact')
const record={file:path.basename(relative),id:meta.id,version:meta.version,size:bytes.length,md5:hash(bytes,'md5'),sha256:hash(bytes),sha512:hash(bytes,'sha512'),url:'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'+relative,custom:true}
server.modules.push({id:'ktz.tokemon:'+meta.id+':'+record.sha256.slice(0,12),name:meta.id+' '+meta.version,type:'FabricMod',required:{value:true},artifact:{size:record.size,MD5:record.md5,url:record.url}})
server.version=version;inventory.mods.push(record);inventory.modCount=inventory.mods.length
assert.equal(inventory.modCount,67);assert.deepEqual(old.modules,server.modules.slice(0,-1));assert.deepEqual(inventoryBefore.mods,inventory.mods.slice(0,-1))
assert.deepEqual({...before,servers:[]},{...distro,servers:[]});assert.deepEqual(before.servers.filter(s=>s.id!=='tokemon'),distro.servers.filter(s=>s.id!=='tokemon'))
assert.deepEqual({...old,modules:[],version:''},{...server,modules:[],version:''});assert.deepEqual({...inventoryBefore,mods:[],modCount:0},{...inventory,mods:[],modCount:0})
assert(!fs.existsSync(work+'/backup'),'Preserve previous staging backup');fs.mkdirSync(work+'/backup',{recursive:true})
for(const file of files){const dest=path.join(work,'backup',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest,fs.constants.COPYFILE_EXCL)}
const privatePaths=['C:/Users/nabar/AppData/Roaming/KTZ Launcher/config.json','C:/Users/nabar/AppData/Roaming/KTZ Launcher/distribution.json','C:/Users/nabar/AppData/Roaming/.mrslauncher/instances/tokemon/forgeMods.list','C:/Users/nabar/AppData/Roaming/.mrslauncher/instances/tokemon/options.txt']
const protectedFiles=privatePaths.filter(p=>fs.existsSync(p)).map(file=>({file,sha256:hash(fs.readFileSync(file))}))
for(let i=0;i<files.length;i++)assert.deepEqual(fs.readFileSync(path.join(root,files[i])),original[i],'Concurrent distribution edit')
fs.copyFileSync(checked.jar,path.join(root,relative),fs.constants.COPYFILE_EXCL);write(path.join(root,files[0]),distro);write(path.join(root,files[1]),inventory)
const news='docs/packs/tokemon-'+version+'.txt'
fs.writeFileSync(path.join(root,news),`토켓몬 ${version}\n\n뉴비 포켓몬 랜덤 상자와 악마의 포켓몬 랜덤 상자 2종을 추가합니다.\n뉴비: 1~9세대 풀·불꽃·물 스타팅 27종.\n악마: 일반 포켓몬 중 3단계 진화 계열의 첫 형태 113개 후보(지역폼 포함). 전설·환상·울트라비스트·패러독스 및 중간·최종 진화체는 제외합니다.\n\n우클릭으로 1마리, 기본 Lv.10, 후보별 동일 확률. 파티가 가득 차면 PC로 지급하고 PC도 가득 차면 상자를 보존합니다. 개봉 토큰으로 중복 지급을 차단합니다.\n운영진: /뉴비박스 지급 [플레이어] [개수], /악마박스 지급 [플레이어] [개수].\n기존 스타팅 퀘스트·계정당 1회 지급 기록은 유지합니다.\n\n서버에도 같은 모드가 필요합니다. 서버 업데이트 안내 후 Minecraft를 종료하고 KTZ에서 토켓몬 PLAY로 갱신하세요. 격리 서버 및 실제 게임 렌더러 검증을 완료했으며 운영 서버 실제 플레이어 개봉 검증은 아직 하지 않았습니다.\n\nSHA256 ${record.sha256}\n`)
for(const f of protectedFiles)assert.equal(hash(fs.readFileSync(f.file)),f.sha256,'Private launcher state changed')
write(work+'/staging.json',{status:'STAGED_NOT_PUBLISHED',createdAt:new Date().toISOString(),root,version,oldVersion:old.version,modCount:inventory.modCount,unchangedMods:66,protectedFiles,otherServersPreserved:true,otherModsPreserved:true,settingsPreserved:true,productionServerModified:false,serverUpdateRequired:true,changes:[{relative,record}],publishFiles:[...files,relative,news,'tools/update-tokemon-pokemon-boxes.js','tools/verify-tokemon-pokemon-boxes.js']})
console.log(JSON.stringify({status:'STAGED_NOT_PUBLISHED',version,modCount:inventory.modCount,added:meta.id,sha256:record.sha256,work}))

