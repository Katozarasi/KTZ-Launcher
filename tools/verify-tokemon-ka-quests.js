const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),vm=require('vm'),http=require('http'),{createRequire}=require('module'),AdmZip=require('adm-zip');
const {DistributionAPI,HeliosDistribution}=require('helios-core/common'),{DistributionIndexProcessor,downloadFile}=require('helios-core/dl');
const root=path.resolve(__dirname,'..'),work='C:/codex/Builds/KTZ-Tokemon-KaQuests-20261019',read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=(p,a='sha256')=>crypto.createHash(a).update(fs.readFileSync(p)).digest('hex'),write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const staging=read(work+'/staging.json'),before=read(staging.backup+'/distribution.json'),candidate=read(root+'/distribution.json'),inventory=read(root+'/docs/packs/tokemon-files.json'),rawBase='https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/',published=process.argv.includes('--published'),mode=published?'published':'staged',run=work+'/'+mode+'-'+Date.now(),flatten=mods=>mods.flatMap(m=>[m,...flatten(m.subModules)]),changed=m=>staging.changes.some(c=>m.rawModule.id.startsWith(`ktz.tokemon:${c.record.id}:`));
const loader=createRequire(root+'/package.json');
function builder(server){
  const config={getCommonDirectory:()=>run+'/common',getInstanceDirectory:()=>run+'/instances',getAutoConnect:()=>true},module={exports:{}};
  vm.runInNewContext(fs.readFileSync(root+'/app/assets/js/processbuilder.js','utf8'),{module,exports:module.exports,process,console,Buffer,require:id=>id==='./configmanager'?config:loader(id)},{filename:'KTZ-ProcessBuilder.js'});
  const pb=new module.exports(server,{},{},{},require('../package.json').version);pb.usingFabricLoader=true;fs.mkdirSync(pb.gameDir,{recursive:true});return pb;
}
async function seedOld(){
  const old=new HeliosDistribution(before,run+'/common',run+'/instances').getServerById('tokemon'),actualRoot='C:/Users/nabar/AppData/Roaming/.mrslauncher',actual=new HeliosDistribution(before,actualRoot+'/common',actualRoot+'/instances').getServerById('tokemon'),lookup=new Map(flatten(actual.modules).map(m=>[m.rawModule.id,m]));let downloads=0;
  for(const m of flatten(old.modules)){
    const a=m.rawModule.artifact,local=a.url.startsWith(rawBase)?root+'/'+a.url.slice(rawBase.length):null,actualFile=lookup.get(m.rawModule.id)?.getPath(),cached='C:/codex/Cache/KTZ-Launcher/tokemon-artifacts/'+a.MD5;
    const source=[local,actualFile,cached].find(f=>f&&fs.existsSync(f)&&hash(f,'md5')===a.MD5);fs.mkdirSync(path.dirname(m.getPath()),{recursive:true});
    if(source)fs.copyFileSync(source,m.getPath(),fs.constants.COPYFILE_EXCL);else{await downloadFile(a.url,m.getPath());downloads++;}
    assert.equal(hash(m.getPath(),'md5'),a.MD5,m.rawModule.id);
  }
  return {old,downloads};
}
async function main(){
  fs.mkdirSync(run,{recursive:true});
  const oldServer=before.servers.find(s=>s.id==='tokemon'),newServer=candidate.servers.find(s=>s.id==='tokemon'),untouched=mods=>mods.filter(m=>!staging.changes.some(c=>m.id.startsWith(`ktz.tokemon:${c.record.id}:`)));
  assert.deepEqual(before.servers.filter(s=>s.id!=='tokemon'),candidate.servers.filter(s=>s.id!=='tokemon'));assert.deepEqual(untouched(oldServer.modules),untouched(newServer.modules));assert.deepEqual({...oldServer,modules:[],version:''},{...newServer,modules:[],version:''});assert.equal(newServer.version,staging.version);
  let transport,url=rawBase+'distribution.json';
  if(!published){
    transport=http.createServer((request,response)=>{
      if(request.url==='/distribution.json'){const d=structuredClone(candidate);for(const m of d.servers.find(s=>s.id==='tokemon').modules)if(staging.changes.some(c=>m.id.startsWith(`ktz.tokemon:${c.record.id}:`)))m.artifact.url=`http://127.0.0.1:${transport.address().port}/`+m.artifact.url.slice(rawBase.length);response.setHeader('Content-Type','application/json');response.end(JSON.stringify(d));}
      else{const item=staging.changes.find(c=>'/'+c.relative===request.url);if(!item){response.writeHead(404);response.end();}else response.end(fs.readFileSync(root+'/'+item.relative));}
    });await new Promise(resolve=>transport.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${transport.address().port}/distribution.json`;
  }
  try{
    const seeded=await seedOld();fs.mkdirSync(run+'/launcher');write(run+'/launcher/distribution.json',before);
    const api=new DistributionAPI(run+'/launcher',run+'/common',run+'/instances',url,false),distribution=await api.refreshDistributionOrFallback(),server=distribution.getServerById('tokemon');assert.equal(server.rawServer.version,staging.version);
    const processor=new DistributionIndexProcessor(run+'/common',distribution,'tokemon'),queued=(await processor.validate(async()=>{})).distribution;
    assert.equal(queued.length,2,'Exactly quests and starter box must update');assert.ok(queued.every(a=>staging.changes.some(c=>a.id.startsWith(`ktz.tokemon:${c.record.id}:`))));for(const a of queued)await downloadFile(a.url,a.path);assert.equal((await processor.validate(async()=>{})).distribution.length,0);
    const pb=builder(server),mods=pb.resolveModConfiguration({},server.modules).fMods;assert.equal(mods.length,staging.modCount);const args=pb.constructModList(mods);assert.equal(args[0],'--fabric.addMods');const loaded=fs.readFileSync(pb.forgeModListFile,'utf8').trim().split(/\r?\n/);assert.equal(loaded.length,66);
    const ids=new Set();for(const file of loaded){const raw=new AdmZip(file).readAsText('fabric.mod.json'),meta=JSON.parse(raw.replace(/"(?:[^"\\]|\\.)*"/gs,s=>s.replace(/[\u0000-\u001f]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`)));assert.ok(!ids.has(meta.id),'Duplicate mod '+meta.id);ids.add(meta.id);assert.equal(hash(file),inventory.mods.find(m=>m.id===meta.id).sha256);}
    assert.ok(ids.has('tokemon_quests'));assert.ok(!ids.has('tokemon_npc_admin'));const starter=mods.find(m=>m.rawModule.id.startsWith('ktz.tokemon:tokemon_starterbox:'));assert.equal(hash(starter.getPath()),staging.changes.find(c=>c.record.id==='tokemon_starterbox').record.sha256);
    const oldStarter=seeded.old.modules.find(m=>m.rawModule.id.startsWith('ktz.tokemon:tokemon_starterbox:'));assert.ok(fs.existsSync(oldStarter.getPath()));assert.ok(!loaded.includes(oldStarter.getPath()));
    fs.writeFileSync(starter.getPath(),'isolated corrupt-download check');const repair=(await processor.validate(async()=>{})).distribution;assert.equal(repair.length,1);assert.equal(repair[0].id,starter.rawModule.id);await downloadFile(repair[0].url,repair[0].path);assert.equal((await processor.validate(async()=>{})).distribution.length,0);
    const connect=[];pb._processAutoConnectArg(connect);assert.deepEqual(connect,['--quickPlayMultiplayer','1.224.237.11:25565']);
    for(const p of staging.protectedFiles)assert.equal(hash(p.file),p.sha256);assert.deepEqual(read(root+'/admin/servers.json'),read(staging.backup+'/admin/servers.json'));if(published)assert.deepEqual(distribution.rawDistribution,candidate);
    const report={passed:true,checkedAt:new Date().toISOString(),mode,version:staging.version,modCount:mods.length,changedArtifacts:queued.length,nativeDistributionRefreshVerified:true,nativeDownloadValidatorVerified:true,checksumRepairVerified:true,nativeProcessBuilderVerified:true,oldStarterExcluded:true,serverOnlyNpcAdminExcluded:true,otherServersAndModulesPreserved:true,settingsPreserved:true,autoConnect:connect,seedDownloads:seeded.downloads,loadedModIds:[...ids],authenticatedGameLaunched:false,humanGameplayVerified:false};write(run+'/verification.json',report);write(work+'/'+mode+'-verification.json',report);console.log(JSON.stringify({passed:true,mode,version:report.version,modCount:report.modCount,changedArtifacts:2,report:run+'/verification.json'}));
  }finally{if(transport)await new Promise(resolve=>transport.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
