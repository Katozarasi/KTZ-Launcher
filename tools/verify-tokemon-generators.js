const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),vm=require('vm'),http=require('http');
const {createRequire}=require('module'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),work=process.env.KTZ_GENERATORS_WORK||'C:/codex/Builds/KTZ-Generators-20261021';
const loader=createRequire(path.join(process.env.KTZ_TOOL_DEPENDENCY_ROOT||'C:/codex/Projects/KTZ-Launcher','package.json'));
const AdmZip=loader('adm-zip'),{DistributionAPI,HeliosDistribution}=loader('helios-core/common'),{DistributionIndexProcessor,downloadFile}=loader('helios-core/dl');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const hash=(f,a='sha256')=>crypto.createHash(a).update(fs.readFileSync(f)).digest('hex');
const write=(f,o)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n');};
const staging=read(work+'/staging.json'),before=read(staging.backup+'/distribution.json'),inventoryBefore=read(staging.backup+'/docs/packs/tokemon-files.json');
const candidate=read(root+'/distribution.json'),inventory=read(root+'/docs/packs/tokemon-files.json');
const published=process.argv.includes('--published'),installLocal=process.argv.includes('--install-local');assert(!installLocal||published);
const raw='https://raw.githubusercontent.com/Katozarasi/KTZ-Launcher/main/',remoteUrl=raw+'distribution.json';
const mode=published?'published':'staged',run=work+'/'+mode+'-'+Date.now(),checks=[];
const observedConcurrentChanges=new Set();
function gameActive(){const ps="$ErrorActionPreference='Stop';$p=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^javaw?\\.exe$' -and $_.CommandLine -like '*instances*tokemon*'});@{running=$p.Count}|ConvertTo-Json -Compress";const r=spawnSync('powershell.exe',['-NoProfile','-Command',ps],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout).running>0;}
const check=(name,fn)=>{fn();checks.push(name);};
const changed=m=>staging.changes.some(c=>m.rawModule.id.startsWith(`ktz.tokemon:${c.record.id}:`));
const mods=server=>server.modules.filter(m=>m.rawModule.type==='FabricMod');
function meta(file){return JSON.parse(new AdmZip(file).readAsText('fabric.mod.json').replace(/"(?:[^"\\]|\\.)*"/gs,s=>s.replace(/[\u0000-\u001f]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`)));}
function builder(server,base){const cfg={getCommonDirectory:()=>path.join(base,'common'),getInstanceDirectory:()=>path.join(base,'instances'),getAutoConnect:()=>true};const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(root+'/app/assets/js/processbuilder.js','utf8'),{module,exports:module.exports,process,console,Buffer,require:id=>id==='./configmanager'?cfg:loader(id)},{filename:'KTZ-ProcessBuilder.js'});
 const result=new module.exports(server,{},{},{},read(root+'/package.json').version);result.usingFabricLoader=true;fs.mkdirSync(result.gameDir,{recursive:true});return result;
}
function protectedCheck(){const changes=staging.protectedFiles.filter(f=>!fs.existsSync(f.file)||hash(f.file)!==f.sha256);if(changes.length){assert(gameActive(),'User data changed while no game is active; inspect before proceeding');for(const f of changes)observedConcurrentChanges.add(f.file);}assert.deepEqual(read(root+'/admin/servers.json'),read(staging.backup+'/admin/servers.json'));}
function untouchedRuntime(){for(const f of staging.runtimeFiles){assert.equal(fs.existsSync(f.file),f.exists);if(f.exists)assert.equal(hash(f.file),f.sha256,'Actual runtime changed before local installation');}}
async function queue(processor,server){const q=[];await processor.validateModules(mods(server),q);return q;}
async function seed(base){const old=new HeliosDistribution(before,path.join(base,'common'),path.join(base,'instances')).getServerById('tokemon');
 const actual=new HeliosDistribution(before,path.join(staging.actualDataDirectory,'common'),path.join(staging.actualDataDirectory,'instances')).getServerById('tokemon');
 const current=new Map(mods(actual).map(m=>[m.rawModule.id,m]));
 for(const m of mods(old)){const a=m.rawModule.artifact,to=m.getPath(),relative=a.url.startsWith(raw)?a.url.slice(raw.length):null;
  const cached='C:/codex/Cache/KTZ-Launcher/tokemon-artifacts/'+a.MD5;
  const from=[current.get(m.rawModule.id).getPath(),relative?path.join(root,relative):'',cached].find(f=>f&&fs.existsSync(f)&&hash(f,'md5')===a.MD5);
  fs.mkdirSync(path.dirname(to),{recursive:true});if(from)fs.copyFileSync(from,to);else{await downloadFile(a.url,to);assert.equal(hash(to,'md5'),a.MD5);fs.mkdirSync(path.dirname(cached),{recursive:true});fs.copyFileSync(to,cached);}
  assert.equal(hash(to,'md5'),a.MD5);
 }return old;
}
function validateLaunch(server,base,previous){const pb=builder(server,base),selected=pb.resolveModConfiguration({},server.modules).fMods;
 assert.equal(selected.length,70);const args=pb.constructModList(selected);assert.equal(args[0],'--fabric.addMods');assert.equal(args[1],'@'+pb.forgeModListFile);
 const files=fs.readFileSync(pb.forgeModListFile,'utf8').trim().split(/\r?\n/);assert.equal(files.length,70);assert.equal(new Set(files).size,70);
 const ids=new Set();for(const file of files){const info=meta(file);assert(!ids.has(info.id),'Duplicate mod ID: '+info.id);ids.add(info.id);const record=inventory.mods.find(m=>m.id===info.id);assert(record,'Unknown mod '+info.id);assert.equal(hash(file),record.sha256);}
 for(const m of mods(previous).filter(m=>!changed(m)))assert(files.includes(m.getPath()),'Unrelated mod excluded: '+m.rawModule.id);
 const oldShop=mods(previous).find(changed);assert(fs.existsSync(oldShop.getPath()),'Old cache removed');assert(!files.includes(oldShop.getPath()),'Duplicate old shop loaded');
 for(const c of staging.changes){const file=mods(server).find(m=>m.rawModule.id.startsWith(`ktz.tokemon:${c.record.id}:`)).getPath();assert.equal(meta(file).version,c.record.version);assert(files.includes(file));}
 const gen=mods(server).find(m=>m.rawModule.id.startsWith('ktz.tokemon:tokemon_generators:')).getPath(),g=meta(gen);
 assert.equal(g.environment,'*');assert.equal(g.depends.cobblemon,'1.8.2');assert.equal(g.depends.tokemon_cards,'0.1.4');assert.equal(g.depends.tokemon_shop,'>=0.4.5 <0.5');
 assert.equal(inventory.mods.find(m=>m.id==='cobblemon').version,'1.8.2+1.21.1');assert.equal(inventory.mods.find(m=>m.id==='tokemon_cards').version,'0.1.4');assert.equal(inventory.mods.find(m=>m.id==='tokemon_shop').version,'0.4.5');
 assert(!new AdmZip(gen).getEntries().some(e=>/(^|\/)(qa|clientqa)\/|(?:Qa|CoreTest)\.class$/.test(e.entryName)));
 const connect=[];pb._processAutoConnectArg(connect);assert.deepEqual(connect,['--quickPlayMultiplayer',`${previous.hostname}:${previous.port}`]);
 return {fileCount:files.length,uniqueModIds:ids.size,files};
}
async function localInstall(){protectedCheck();untouchedRuntime();
 const guard=gameActive;
 const active=guard(),data=staging.actualDataDirectory,launcher='C:/Users/nabar/AppData/Roaming/KTZ Launcher';
 const api=new DistributionAPI(launcher,path.join(data,'common'),path.join(data,'instances'),remoteUrl,false),distribution=await api.refreshDistributionOrFallback();
 assert.deepEqual(distribution.rawDistribution,candidate,'Actual launcher did not receive the reviewed public index');const server=distribution.getServerById('tokemon');
 const processor=new DistributionIndexProcessor(path.join(data,'common'),distribution,'tokemon'),q=await queue(processor,server);
 for(const asset of q){await downloadFile(asset.url,asset.path);const record=inventory.mods.find(m=>m.md5===asset.hash);assert(record);assert.equal(hash(asset.path),record.sha256);}
 assert.equal((await queue(processor,server)).length,0);let launch;
 if(!active&&!guard()){const previous=new HeliosDistribution(before,path.join(data,'common'),path.join(data,'instances')).getServerById('tokemon');launch=validateLaunch(server,data,previous);}
 else{const previous=staging.runtimeFiles.find(f=>f.file.endsWith('forgeMods.list'));assert.equal(hash(previous.file),previous.sha256);}
 protectedCheck();return {cachedIndexVersion:server.rawServer.version,downloaded:q.length,downloadedIds:q.map(a=>a.id),modArtifactsVerified:70,launchListUpdated:!!launch,launchListCount:launch?.fileCount??null,launchListDeferredUntilPlay:!launch,existingGamePreserved:active,gameLaunched:false,userFilesObserved:staging.protectedFiles.length,userSettingsWrittenByUpdater:false};
}
async function main(){fs.mkdirSync(run,{recursive:true});
 check('only_tokemon_pack_metadata_changes',()=>{assert.deepEqual({...before,servers:[]},{...candidate,servers:[]});assert.deepEqual(before.servers.filter(s=>s.id!=='tokemon'),candidate.servers.filter(s=>s.id!=='tokemon'));const old=before.servers.find(s=>s.id==='tokemon'),next=candidate.servers.find(s=>s.id==='tokemon');assert.deepEqual({...old,modules:[],version:''},{...next,modules:[],version:''});assert.equal(next.version,staging.version);});
 check('68_preexisting_mods_preserved',()=>{const keep=m=>!staging.changes.some(c=>m.id.startsWith(`ktz.tokemon:${c.record.id}:`));assert.deepEqual(before.servers.find(s=>s.id==='tokemon').modules.filter(keep),candidate.servers.find(s=>s.id==='tokemon').modules.filter(keep));assert.deepEqual(inventoryBefore.mods.filter(m=>m.id!=='tokemon_shop'),inventory.mods.filter(m=>!['tokemon_shop','tokemon_generators'].includes(m.id)));assert.equal(inventoryBefore.mods.length-1,68);});
 check('inventory_and_required_modules_match',()=>{assert.equal(inventory.modCount,70);assert.equal(inventory.mods.length,70);assert.deepEqual({...inventory,mods:[],modCount:0},{...inventoryBefore,mods:[],modCount:0});for(const c of staging.changes){assert.deepEqual(inventory.mods.find(m=>m.id===c.record.id),c.record);assert.equal(hash(root+'/'+c.relative),c.record.sha256);const module=candidate.servers.find(s=>s.id==='tokemon').modules.find(m=>m.id.startsWith(`ktz.tokemon:${c.record.id}:`));assert.equal(module.required.value,true);assert.equal(module.artifact.MD5,c.record.md5);assert.equal(module.artifact.size,c.record.size);assert.equal(module.artifact.url,c.record.url);}});
 check('private_data_observed_and_actual_runtime_untouched',()=>{protectedCheck();untouchedRuntime();});
 let transport,url=remoteUrl;
 if(!published){transport=http.createServer((req,res)=>{if(req.url==='/distribution.json'){const d=structuredClone(candidate);for(const m of d.servers.find(s=>s.id==='tokemon').modules)if(staging.changes.some(c=>m.id.startsWith(`ktz.tokemon:${c.record.id}:`)))m.artifact.url=`http://127.0.0.1:${transport.address().port}/`+m.artifact.url.slice(raw.length);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));}else{const c=staging.changes.find(c=>'/'+c.relative===req.url);if(!c){res.writeHead(404);res.end();return;}res.end(fs.readFileSync(root+'/'+c.relative));}});await new Promise(r=>transport.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${transport.address().port}/distribution.json`;}
 let local;
 try{const previous=await seed(run);checks.push('all_69_base_mod_artifacts_verified_in_isolation');const launcher=run+'/launcher';fs.mkdirSync(launcher);write(launcher+'/distribution.json',before);
  const api=new DistributionAPI(launcher,run+'/common',run+'/instances',url,false),distribution=await api.refreshDistributionOrFallback(),server=distribution.getServerById('tokemon');assert.equal(server.rawServer.version,staging.version);checks.push('native_index_refresh');
  const processor=new DistributionIndexProcessor(run+'/common',distribution,'tokemon'),q=await queue(processor,server);assert.equal(q.length,2);assert.deepEqual(q.map(a=>a.id).sort(),mods(server).filter(changed).map(m=>m.rawModule.id).sort());checks.push('only_two_reviewed_artifacts_queued');
  for(const a of q)await downloadFile(a.url,a.path);assert.equal((await queue(processor,server)).length,0);checks.push('native_download_and_md5_validation');
  const launch=validateLaunch(server,run,previous);assert.equal(launch.fileCount,70);checks.push('native_fabric_addmods_70_unique_verified_jars','shop_dependency_satisfied','existing_mods_and_old_cache_preserved','unchanged_quickplay_address','qa_code_excluded');
  const generator=mods(server).find(m=>m.rawModule.id.startsWith('ktz.tokemon:tokemon_generators:'));fs.writeFileSync(generator.getPath(),'isolated corrupt jar');const repair=await queue(processor,server);assert.equal(repair.length,1);assert.equal(repair[0].id,generator.rawModule.id);await downloadFile(repair[0].url,repair[0].path);assert.equal((await queue(processor,server)).length,0);assert.equal(hash(generator.getPath()),staging.changes.find(c=>c.record.id==='tokemon_generators').record.sha256);checks.push('corrupt_download_detected_and_repaired');
  if(published){assert.deepEqual(distribution.rawDistribution,candidate);checks.push('public_manifest_exactly_matches_reviewed_candidate');for(const c of staging.changes){const response=await fetch(c.record.url,{cache:'no-store'});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),c.record.sha256);}checks.push('public_jar_sha256_verified');}
  check('private_data_observed_after_isolated_tests',protectedCheck);
  if(installLocal){local=await localInstall();checks.push('actual_launcher_cache_applied',local.launchListUpdated?'actual_70_mod_launch_list_verified':'active_game_launch_list_preserved_until_next_play','user_settings_not_written_by_updater');}
 }finally{if(transport)await new Promise(r=>transport.close(r));}
 const report={status:'PASS',mode,checkCount:checks.length,checks,version:staging.version,modCount:70,unchangedMods:68,runRoot:run,local:local||null,concurrentGameChangesObserved:[...observedConcurrentChanges],userSettingsWrittenByUpdater:false,serverRestarted:false,gameLaunched:false,authenticatedGameplayVerified:false,at:new Date().toISOString()};write(work+'/'+mode+'-verification.json',report);console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
