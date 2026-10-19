const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),AdmZip=require('adm-zip');
const root=path.resolve(__dirname,'..'),project='C:/codex/Projects/Tokemon',qa='C:/codex/Builds/Tokemon-QuestAdminFixQA-20261019',work='C:/codex/Builds/KTZ-QuestAdminFix-20261019',release=project+'/dist/Tokemon-QuestAdminFix-0.1.1';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),digest=(b,a='sha256')=>crypto.createHash(a).update(b).digest('hex'),write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');};
const native=read(qa+'/fixed-verification.json');assert.equal(native.passed,true);assert.equal(native.phase,'fixed');
const m=read(read(project+'/quests/build-result.json').manifest),bytes=fs.readFileSync(m.jar),zip=new AdmZip(bytes),meta=JSON.parse(zip.readAsText('fabric.mod.json'));
assert.equal(meta.id,'tokemon_quests');assert.equal(meta.version,'0.1.1');assert.equal(digest(bytes),m.sha256);assert(!zip.getEntries().some(e=>/questsqa|QuestCoreTest|QuestQa/.test(e.entryName)));
const before=read(root+'/distribution.json'),inventoryBefore=read(root+'/docs/packs/tokemon-files.json'),d=structuredClone(before),s=d.servers.find(x=>x.id==='tokemon'),old=before.servers.find(x=>x.id==='tokemon'),inventory=structuredClone(inventoryBefore);
const selected=s.modules.filter(x=>x.id.startsWith('ktz.tokemon:tokemon_quests:'));assert.equal(selected.length,1);
const match=old.version.match(/^(2026\.10\.19)\.(\d+)$/);assert(match);const version=match[1]+'.'+(Number(match[2])+1),relative='files/mods/tokemon/tokemon-quests-0.1.1.jar';
assert(!fs.existsSync(root+'/'+relative));assert(!fs.existsSync(work));fs.mkdirSync(work+'/backup',{recursive:true});
for(const file of ['distribution.json','docs/packs/tokemon-files.json']){const p=work+'/backup/'+file;fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(root+'/'+file,p);}
const record={file:path.basename(relative),id:meta.id,version:meta.version,size:bytes.length,md5:digest(bytes,'md5'),sha256:digest(bytes),sha512:digest(bytes,'sha512'),url:'https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/'+relative,custom:true};
const replacement={...selected[0],id:'ktz.tokemon:tokemon_quests:'+record.sha256.slice(0,12),name:'토켓몬 퀘스트 · 관리 화면·초기화 수정 0.1.1',artifact:{size:record.size,MD5:record.md5,url:record.url}};
s.modules=s.modules.map(x=>x.id===selected[0].id?replacement:x);s.version=version;
assert.equal(inventory.mods.filter(x=>x.id===meta.id).length,1);inventory.mods=inventory.mods.map(x=>x.id===meta.id?record:x);
const untouched=s=>s.modules.filter(x=>!x.id.startsWith('ktz.tokemon:tokemon_quests:'));
assert.deepEqual(untouched(s),untouched(old));assert.deepEqual(d.servers.filter(x=>x.id!=='tokemon'),before.servers.filter(x=>x.id!=='tokemon'));assert.deepEqual({...s,version:'',modules:[]},{...old,version:'',modules:[]});assert.equal(inventory.modCount,inventoryBefore.modCount);assert.equal(s.modules.length,old.modules.length);
assert.deepEqual(inventory.mods.filter(x=>x.id!==meta.id),inventoryBefore.mods.filter(x=>x.id!==meta.id));
for(const file of ['distribution.json','docs/packs/tokemon-files.json'])assert.equal(digest(fs.readFileSync(root+'/'+file)),digest(fs.readFileSync(work+'/backup/'+file)),'Concurrent manifest edit: '+file);
fs.copyFileSync(m.jar,root+'/'+relative,fs.constants.COPYFILE_EXCL);write(root+'/distribution.json',d);write(root+'/docs/packs/tokemon-files.json',inventory);
const notes='토켓몬 '+version+'\n\n퀘스트 관리 화면 위로 중복 적용되던 흐림·회색 배경을 수정했습니다.\n선택·전체 초기화는 진행·발견·완료 상태를 초기화하며, 이미 지급한 보상 영수증과 스타팅 박스 1회 제한은 보존합니다.\n게임을 종료하고 KTZ → 토켓몬 → PLAY로 다시 실행하세요.\n서버 초기화 수정은 서버 0.1.1 적용·재시작 후 반영됩니다.\n';fs.writeFileSync(root+'/docs/packs/tokemon-'+version+'.txt',notes);
fs.mkdirSync(release,{recursive:true});fs.copyFileSync(m.jar,release+'/tokemon-quests-0.1.1.jar');fs.copyFileSync(qa+'/fixed-verification.json',release+'/native-verification.json');
const staging={status:'STAGED_FOR_PUBLICATION',version,oldVersion:old.version,record,artifact:m.jar,release,modCount:s.modules.length,otherModulesPreserved:untouched(s).length,protocolVersion:3,
 changedFiles:['distribution.json','docs/packs/tokemon-files.json',relative,'docs/packs/tokemon-'+version+'.txt'],nativeUiVerified:true,serverInstalled:false};
write(work+'/staging.json',staging);write(project+'/reports/quest-admin-fix-20261019/client-staging.json',staging);console.log(JSON.stringify({version,modCount:s.modules.length,changedMod:'tokemon_quests',work,release}));
