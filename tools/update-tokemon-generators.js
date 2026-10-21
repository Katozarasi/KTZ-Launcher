/* Stage only the reviewed generator and its shop dependency. Does not launch Minecraft. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const work=process.env.KTZ_GENERATORS_WORK||'C:/codex/Builds/KTZ-Generators-20261021';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const hash=(f,a='sha256')=>crypto.createHash(a).update(fs.readFileSync(f)).digest('hex');
const write=(f,o)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n');};
const raw='https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/';
const version='2026.10.21.3',before=read(root+'/distribution.json'),inventoryBefore=read(root+'/docs/packs/tokemon-files.json');
const old=before.servers.find(s=>s.id==='tokemon');assert.equal(old.version,'2026.10.21.2');assert.equal(inventoryBefore.modCount,69);
const backup='C:/codex/Backups/Tokemon-Generators-20261021/launcher-'+new Date().toISOString().replace(/[:.]/g,'-');fs.mkdirSync(backup,{recursive:true});
for(const f of ['distribution.json','docs/packs/tokemon-files.json','admin/servers.json']){const to=path.join(backup,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,f),to);}
const launcher='C:/Users/nabar/AppData/Roaming/KTZ Launcher',data=read(launcher+'/config.json').settings.launcher.dataDirectory;
const privateFiles=[launcher+'/config.json'];
function walk(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const f=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Unexpected linked user data: '+f);if(e.isDirectory())return e.name==='logs'?[]:walk(f);return e.name==='forgeMods.list'?[]:[f];});}
privateFiles.push(...walk(path.join(data,'instances/tokemon')));
const protectedFiles=[...new Set(privateFiles)].map(file=>({file,sha256:hash(file)}));
for(let n=0;n<protectedFiles.length;n++)fs.copyFileSync(protectedFiles[n].file,backup+'/private-'+n);
const runtimeFiles=[launcher+'/distribution.json',path.join(data,'instances/tokemon/forgeMods.list')].map(file=>({file,exists:fs.existsSync(file),sha256:fs.existsSync(file)?hash(file):null}));
for(let n=0;n<runtimeFiles.length;n++)if(runtimeFiles[n].exists)fs.copyFileSync(runtimeFiles[n].file,backup+'/runtime-'+n);
const changes=[];
for(const [source,id,v,sha256] of [
 ['C:/codex/Projects/Tokemon/generators/release/1.0.0/mods/tokemon-generators-1.0.0.jar','tokemon_generators','1.0.0','5c87be524dd857f2e547a67dd7ac1aeb0f210ea7dc0d2993038042441e2fde80'],
 ['C:/codex/Projects/Tokemon/server/mods/tokemon-shop-0.4.5.jar','tokemon_shop','0.4.5','926308fb459bcc349cc2f6d1854535f6cc380eda31cc8409192b1423c5a757e4']
]){
 assert.equal(hash(source),sha256);const file=path.basename(source),relative='files/mods/tokemon/'+file,target=path.join(root,relative);
 assert(!fs.existsSync(target),'Existing reviewed artifact: '+file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
 const record={file,id,version:v,size:fs.statSync(target).size,md5:hash(target,'md5'),sha256,sha512:hash(target,'sha512'),url:raw+relative,custom:true};
 const previous=inventoryBefore.mods.find(m=>m.id===id)||null;changes.push({relative,record,previous});
}
const candidate=structuredClone(before),inventory=structuredClone(inventoryBefore),server=candidate.servers.find(s=>s.id==='tokemon');server.version=version;
for(const change of changes){const r=change.record,module={id:`ktz.tokemon:${r.id}:${r.sha256.slice(0,12)}`,name:r.id+' '+r.version,type:'FabricMod',required:{value:true},artifact:{size:r.size,MD5:r.md5,url:r.url}};
 const index=server.modules.findIndex(m=>m.id.startsWith(`ktz.tokemon:${r.id}:`));if(index>=0){assert.equal(r.id,'tokemon_shop');server.modules[index]=module;}else server.modules.push(module);
 const i=inventory.mods.findIndex(m=>m.id===r.id);if(i>=0)inventory.mods[i]=r;else inventory.mods.push(r);
}
inventory.modCount=inventory.mods.length;assert.equal(inventory.modCount,70);
write(root+'/distribution.json',candidate);write(root+'/docs/packs/tokemon-files.json',inventory);
const notes=`토켓몬 ${version}\n\n양봉장과 스컬크 생성기를 추가합니다. 서버가 다음 정상 재시작을 마치면 사용할 수 있습니다.\n건축 상점: 양봉장 100,000원, 스컬크 생성기 60,000원. 플레이어당 각 2개까지 설치합니다.\n파티 또는 PC의 허용 포켓몬 1마리를 등록해 생산합니다. 등록 중에는 전투·교환 등에 사용할 수 없으며 회수할 수 있습니다.\n두 생성기 모두 10분마다 C 2개 / B 3개 / A 5개 / S 7개를 생산합니다. 소유자 온라인·청크 로드 상태에서만 진행하며 저장 공간 부족 시 정지합니다.\n양봉장: C 에블리 / B 독침붕 / A 세꿀버리·에리본 / S 비퀸\n스컬크: C 고오스·해골몽·불켜미·어둠대신 / B 고우스트·미라몽·램프라·무우마·깜까미 / A 팬텀·다크펫·무우마직 / S 야느와르몽·샹델라·화강돌\n기존 경험치사탕 제작법, 월드, 포켓몬, 상점 가격·잔액, 런처 로그인과 설정을 유지합니다.\n필수 상점 모드를 운영 서버와 같은 0.4.5로 맞춥니다. 기존 포케바이크·트레이너 카드 업데이트를 유지합니다.\n\n서버를 지금 재시작하거나 리로드하지 않습니다. 운영자의 다음 정상 서버 재시작 후 Minecraft를 종료하고 KTZ 토켓몬 → PLAY로 갱신하세요. 런처 재설치는 필요 없습니다.\n자동·격리 실행·화면 검증 결과와 운영 서버 실제 계정 플레이 검증은 구분합니다. 실제 플레이어 접속과 장시간 운영 검증은 별도로 남아 있습니다.\n\n`+changes.map(c=>`${c.record.file} SHA256 ${c.record.sha256}`).join('\n')+'\n';
fs.writeFileSync(root+'/docs/packs/tokemon-'+version+'.txt',notes);
write(root+'/docs/packs/tokemon-generators-20261021.json',{version,modCount:inventory.modCount,changes:changes.map(({record})=>record),serverStatus:'APPROVED_NEXT_RESTART',prices:{apiary:100000,sculk_generator:60000},limits:{apiary:2,sculk_generator:2},authenticatedGameplayVerified:false});
const report={status:'STAGED_NOT_PUBLISHED',version,modCount:inventory.modCount,unchangedMods:68,backup,changes,protectedFiles,runtimeFiles,actualDataDirectory:data,createdAt:new Date().toISOString()};
write(work+'/staging.json',report);console.log(JSON.stringify({status:report.status,version,modCount:report.modCount,unchangedMods:report.unchangedMods,protectedFiles:protectedFiles.length,backup}));
