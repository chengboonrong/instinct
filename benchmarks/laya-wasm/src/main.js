import * as THREE from 'three';
import { fixtures } from './fixtures.js';
import { WorkerClient } from './worker-client.js';
import { summarize,frameSummary,minuteWindows,recoverReport,toCsv,round } from './report.js';
const byId=id=>document.getElementById(id);
const log=text=>{byId('status').textContent=text;};
const checkpointKey='instinct-laya-wasm-checkpoint-v2';
const modelBaseUrl=import.meta.env.VITE_MODEL_BASE_URL||'/models/laya';
let client,report,busy=false,stopped=false,frames=[],rendering;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function save() {
 if(!report)return;
 report.checkpointAt=new Date().toISOString();
 try{localStorage.setItem(checkpointKey,JSON.stringify(report));}
 catch(error){byId('storage').textContent='Checkpoint unavailable: '+String(error)+'. Export results manually.';}
 byId('json').disabled=false;byId('csv').disabled=false;
}
try {
 const saved=localStorage.getItem(checkpointKey);
 if(saved){report=recoverReport(JSON.parse(saved));save();log('Recovered saved report ('+report.status+'). Export it before starting another run.');}
}catch(error){byId('storage').textContent='Could not recover checkpoint: '+String(error);}
function captureFrames() {
 if(rendering)return;
 const canvas=byId('scene');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
 renderer.setSize(320,180,false);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x13263b);
 const camera=new THREE.PerspectiveCamera(60,320/180,.1,100);camera.position.z=5;
 const geometry=new THREE.BoxGeometry(.2,.2,.2), material=new THREE.MeshBasicMaterial({color:0x25bdab});
 const objects=Array.from({length:35},(_,i)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set((i%7-3)*.5,(Math.floor(i/7)-2)*.5,0);scene.add(mesh);return mesh;});
 let last=null;
 const tick=time=>{
  if(last!==null)frames.push(time-last);last=time;
  objects.forEach((object,i)=>object.rotation.y+=.004+(i%3)*.001);
  renderer.render(scene,camera);rendering.raf=requestAnimationFrame(tick);
 };
 rendering={renderer,geometry,material,raf:requestAnimationFrame(tick)};
}
function stopFrames(){if(!rendering)return;cancelAnimationFrame(rendering.raf);rendering.renderer.dispose();rendering.geometry.dispose();rendering.material.dispose();rendering=null;}
function controls(active){busy=active;byId('start').disabled=active;byId('stop').disabled=!active;byId('soak').disabled=active||!client||client.stopped||!report?.inference||report.inference.successes===0;}
function interrupt(reason) {
 if(!busy)return;
 stopped=true;client?.stop(reason);report.status='interrupted';report.error=reason;
 if(report.sustained&&report.phase==='sustained')report.sustained.completed=false;
 save();log(reason+'; partial report saved.');
}
byId('stop').onclick=()=>interrupt('Stopped by user');
document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt('Safari left foreground; run invalidated');});
window.addEventListener('pagehide',()=>interrupt('Page closed or navigated away; run incomplete'));
async function sample(fixture,phase,phaseStart) {
 const started=performance.now();
 report.pendingSample={id:fixture.id,category:fixture.category,elapsedMs:round(started-phaseStart)};save();
 let result;
 try {
  const output=await client.request('predict',fixture,120000);
  result={...report.pendingSample,ok:true,ms:round(output.ms),roundTripMs:round(performance.now()-started),choice:output.choice,confidence:output.confidence};
 }catch(error){result={...report.pendingSample,ok:false,ms:round(performance.now()-started),error:String(error)};}
 report[phase].samples.push(result);report.pendingSample=null;
 Object.assign(report[phase],summarize(report[phase].samples));save();
 if(client.stopped)stopped=true;
 return result;
}
function shuffled(seed) {
 let value=seed>>>0;
 const list=[...fixtures];
 for(let i=list.length-1;i>0;i--){value=(1664525*value+1013904223)>>>0;const j=value%(i+1);[list[i],list[j]]=[list[j],list[i]];}
 return list;
}
byId('start').onclick=async()=>{
 if(busy)return;
 if(!isSecureContext){log('HTTPS is required for worker/model verification.');return;}
 if(document.hidden){log('Keep this page in the foreground.');return;}
 client?.stop();stopped=false;frames=[];
 const seed=20261028;
 report={schemaVersion:'instinct-laya-wasm-v2',status:'running',phase:'loading',startedAt:new Date().toISOString(),
 sourceCommit:import.meta.env.VITE_SOURCE_COMMIT||'local-unrecorded',deploymentUrl:location.href,
 targetDevice:'iPhone 15 Plus',actualDeviceUnverified:!byId('physical').checked,
 deviceEvidence:byId('physical').checked?'User attestation; not independently verified':null,
 iosSafariBuild:byId('versions').value||null,environmentNotes:byId('notes').value||null,
 userAgent:navigator.userAgent,backendRequested:'wasm',backendVerified:null,backendEvidence:'Pinned source patch restricts all sessions to WASM; runtime EP introspection unavailable',
 runtimeVersion:'1.20.0',wasmThreads:1,workerInference:true,crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',hardwareConcurrency:navigator.hardwareConcurrency??null,
 cacheState:byId('cache').value,coldLoadMs:null,timeToFirstPredictionMs:null,downloadBytes:null,modelManifest:null,modelSource:null,modelBaseUrl,
 fixtureVersion:'mixed-v1',fixtureOrderSeed:seed,accuracy:null,accuracyNotes:'No human-curated labels; confidence is not accuracy',memory:null,thermal:null,
 inference:null,rendering:null,sustained:null,pendingSample:null};
 controls(true);save();const start=performance.now();
 try {
  log('Reading model manifest...');
  const response=await fetch('/models/laya/manifest.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Model manifest missing; run model verification first');
  report.modelManifest=await response.json();
  const expectedSha256={};
  for(const name of ['encoder.onnx','head.onnx','tokenizer.json','rl_agent_config.json']) {
   const entry=report.modelManifest.files?.find(file=>file.name===name);
   if(!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<=0||!/^[a-f0-9]{64}$/i.test(entry.sha256))throw new Error('Invalid model manifest entry: '+name);
   expectedSha256[name]=entry.sha256;
  }
  const source=await fetch('/models/laya/source.json',{cache:'no-store'});
  if(source.ok)report.modelSource=await source.json();
  if(stopped)throw new Error('Load interrupted before worker creation');
  client=new WorkerClient(new Worker(new URL('./inference-worker.js',import.meta.url),{type:'module'}));
  log('Downloading and verifying model; 1.23 GiB. Loading may exceed Safari memory limits.');
  const loaded=await client.request('load',{modelBaseUrl,expectedSha256},900000,progress=>log('Model load: '+progress.file+' ('+progress.done+'/'+progress.total+'). ONNX download/session creation can take several minutes.'));
  report.coldLoadMs=round(performance.now()-start);report.downloadBytes=loaded.downloadBytes;save();
  log('Running first prediction (excluded from timed samples)...');
  await client.request('predict',fixtures[0],120000);
  report.timeToFirstPredictionMs=round(performance.now()-start);save();
  captureFrames();log('Rendering-only baseline: 5 seconds...');await sleep(5000);
  if(stopped)throw new Error('Baseline interrupted');
  report.rendering={baseline:frameSummary(frames)};frames=[];
  report.phase='inference';report.inference={...summarize([]),samples:[]};save();
  const phaseStart=performance.now();
  for(const fixture of shuffled(seed)) {
   if(stopped)break;
   await sample(fixture,'inference',phaseStart);
   log('Decisions '+report.inference.attempted+'/100; failures '+report.inference.failures);
   await sleep(0);
  }
  report.rendering.duringInference=frameSummary(frames);
  report.status=stopped?'interrupted':'discrete-complete';
  log((stopped?'Run interrupted.':'100 decisions complete.')+' Export results before the 10-minute soak.');
 }catch(error){report.status=stopped?'interrupted':'failed';report.error=String(error);client?.stop();log('FAILED (recorded): '+String(error));}
 finally{stopFrames();save();controls(false);}
};
byId('soak').onclick=async()=>{
 if(busy||!client||client.stopped||document.hidden)return;
 stopped=false;frames=[];
 report.status='running';report.phase='sustained';report.sustained={durationTargetSeconds:600,durationMeasuredSeconds:0,completed:false,...summarize([]),samples:[]};
 controls(true);save();const start=performance.now();let index=0;
 try {
  captureFrames();
  while(performance.now()-start<600000&&!stopped) {
   await sample(fixtures[index++%fixtures.length],'sustained',start);
   report.sustained.durationMeasuredSeconds=round((performance.now()-start)/1000);
   report.sustained.rendering=frameSummary(frames);
   log('Soak '+Math.floor(report.sustained.durationMeasuredSeconds)+'/600 s; decisions '+index+'; failures '+report.sustained.failures);save();
   await sleep(0);
  }
  const duration=performance.now()-start;
  report.sustained.durationMeasuredSeconds=round(duration/1000);
  report.sustained.minuteWindows=minuteWindows(report.sustained.samples,duration);
  report.sustained.completed=!stopped&&duration>=600000;
  report.status=report.sustained.completed?'complete':'interrupted';
  log(report.sustained.completed?'10-minute run finished; export JSON and CSV.':'Run interrupted; export partial report.');
 }catch(error){report.status='failed';report.error=String(error);log('FAILED (recorded): '+String(error));}
 finally{stopFrames();save();controls(false);}
};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
byId('json').onclick=()=>download('instinct-laya-wasm.json',JSON.stringify(report,null,2),'application/json');
byId('csv').onclick=()=>download('instinct-laya-wasm.csv',toCsv(report),'text/csv');
