import { Agent } from "laya-ts";
import * as ort from "onnxruntime-web";
import * as THREE from "three";

// Single-threaded WASM on all iOS Safari configurations, including non-isolated pages.
// The ONNX Runtime WASM binaries are copied by scripts/prepare-wasm-assets.mjs.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("/wasm/", location.origin).href;

const byId=id=>document.getElementById(id);
const log=t=>{byId("status").textContent=t};
let agent, report, renderer, raf, frames=[];
const categories=[["combat",40],["traffic",25],["social",20],["mission",15]];
const options={
 combat:{attack:"Attack only when advantageous",retreat:"Retreat when seriously threatened",cover:"Seek protective cover"},
 traffic:{stop:"Stop to avoid a collision",cross:"Cross when the road is clear",wait:"Wait until the path clears"},
 social:{greet:"Greet a friendly character",avoid:"Avoid an aggressive stranger",help:"Assist someone in distress"},
 mission:{investigate:"Investigate a suspicious event",continue:"Continue assigned objective",report:"Report dangerous discovery"}
};
function fixture(cat,i){
 const variants={
 combat:[`Enemy health ${10+i%80}%, player distance ${1+i%14}m, player aiming gun ${i%3===0}, nearby allies ${i%4}.`,`Player closing in, NPC stamina ${i%100}%, terrain cover ${i%2===0}.`],
 traffic:[`Pedestrian at road. Oncoming vehicle ${i%3===0}; crossing signal ${i%2===0?"green":"red"}.`],
 social:[`An NPC encounters a ${i%3===0?"friendly":"unknown"} stranger asking for assistance, safety concern ${i%4===0}.`],
 mission:[`Mission objective active, nearby suspicious noise ${i%2===0}, hazard level ${i%5}.`]
 };
 return {id:`${cat}-${i}`,category:cat,state:variants[cat][i%variants[cat].length],question:{action:{type:"choice",instructions:"Choose the appropriate game behavior based on the situation.",criteria:options[cat]}}};
}
const fixtures=categories.flatMap(([c,n])=>Array.from({length:n},(_,i)=>fixture(c,i)));
function percentile(a,p){if(!a.length)return null;let b=[...a].sort((x,y)=>x-y);return b[Math.max(0,Math.ceil(p*b.length)-1)]}
const round=n=>n===null?null:Math.round(n*100)/100;
function summary(samples){const ok=samples.filter(s=>s.ok).map(s=>s.ms);return {attempted:samples.length,successes:ok.length,failures:samples.length-ok.length,p50Ms:round(percentile(ok,.50)),p95Ms:round(percentile(ok,.95)),p99Ms:round(percentile(ok,.99))}}
function captureFrames(){const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;canvas.style="width:320px;height:180px;max-width:100%;border-radius:12px";byId("status").after(canvas);renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"low-power"});renderer.setSize(320,180,false);const scene=new THREE.Scene();scene.background=new THREE.Color(0x13263b);const camera=new THREE.PerspectiveCamera(60,320/180,.1,100);camera.position.z=5;const objects=Array.from({length:35},(_,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshBasicMaterial({color:0x25bdab}));m.position.set((i%7-3)*.5,(Math.floor(i/7)-2)*.5,0);scene.add(m);return m});let last=performance.now();const tick=t=>{frames.push(t-last);last=t;if(frames.length>36000)frames.shift();objects.forEach((o,i)=>o.rotation.y+=.004+(i%3)*.001);renderer.render(scene,camera);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)}
function frameStats(){const a=frames.filter(n=>n>0);return {frames:a.length,frameTimeP95Ms:round(percentile(a,.95)),fpsEstimate:a.length?round(1000/(a.reduce((x,y)=>x+y,0)/a.length)):null,framesOver33ms:a.filter(x=>x>33.3).length}}
function download(name,text,kind){const u=URL.createObjectURL(new Blob([text],{type:kind}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
byId("start").onclick=async()=>{byId("start").disabled=true;report={schemaVersion:"instinct-laya-wasm-v1",backendRequested:"wasm",backendVerified:"build-time provider patch (runtime EP introspection unavailable)",targetDevice:"iPhone 15 Plus",actualDeviceUnverified:true,userAgent:navigator.userAgent,startedAt:new Date().toISOString(),crossOriginIsolated:crossOriginIsolated,hardwareConcurrency:navigator.hardwareConcurrency??null,memory:null,thermal:null,coldLoadMs:null,downloadBytes:null,modelManifest:null,inference:null,rendering:null,sustained:null};try{
 log("Loading model. Original checkpoint may exceed Safari memory limits...");
 const manifestResponse=await fetch("/models/laya/manifest.json",{cache:"no-store"});
 if (!manifestResponse.ok) throw new Error("Model manifest missing. Export model and run scripts/check-model.py first.");
 report.modelManifest=await manifestResponse.json();
 if (!Array.isArray(report.modelManifest.files) || !report.modelManifest.files.some(f=>f.name==="encoder.onnx")) throw new Error("Model manifest invalid");
 const start=performance.now();agent=await Agent.load("/models/laya",{numThreads:1});report.coldLoadMs=round(performance.now()-start);
 report.downloadBytes=performance.getEntriesByType("resource").filter(x=>x.name.includes("/models/laya/")).reduce((n,x)=>n+(x.transferSize||0),0)||null;
 log("Warming up...");await agent.predict(fixtures[0].state,fixtures[0].question);
 captureFrames();await new Promise(r=>setTimeout(r,5000));const baseline=frameStats();frames=[];const samples=[];
 for(const f of fixtures){const t=performance.now();try{const out=await agent.predict(f.state,f.question);samples.push({id:f.id,category:f.category,ms:round(performance.now()-t),ok:true,choice:out.answers.action.choice,confidence:out.answers.action.confidence});}catch(e){samples.push({id:f.id,category:f.category,ms:round(performance.now()-t),ok:false,error:String(e)})}log(`Done ${samples.length}/100 — failed ${samples.filter(x=>!x.ok).length}`)}
 report.inference={...summary(samples),samples};report.rendering={baseline,duringInference:frameStats()};byId("soak").disabled=false;log(JSON.stringify({coldLoadMs:report.coldLoadMs,inference:summary(samples),rendering:report.rendering},null,2));
 }catch(e){report.error=String(e);log("FAILED (recorded): "+String(e))}finally{byId("json").disabled=false;byId("csv").disabled=false}};
byId("soak").onclick=async()=>{if(!agent)return;byId("soak").disabled=true;const start=performance.now();const samples=[];let i=0;let completed=true;log("Sustained run started. Keep Safari foreground and screen awake.");while(performance.now()-start<600000){const f=fixtures[i++%fixtures.length];const t=performance.now();try{const o=await agent.predict(f.state,f.question);samples.push({id:f.id,ms:round(performance.now()-t),ok:true,choice:o.answers.action.choice})}catch(e){samples.push({id:f.id,ms:round(performance.now()-t),ok:false,error:String(e)})}if(i%5===0){log(`Soak: ${Math.floor((performance.now()-start)/1000)}s /600s · samples ${i}`);await new Promise(r=>setTimeout(r,0))}}const duration=(performance.now()-start)/1000;report.sustained={durationMeasuredSeconds:round(duration),completed:completed&&duration>=600,summary:summary(samples),samples,rendering:frameStats()};log("Soak complete. Export JSON / CSV.");};
byId("json").onclick=()=>download("instinct-laya-wasm.json",JSON.stringify(report,null,2),"application/json");
byId("csv").onclick=()=>{const s=report?.inference?.samples||[];download("instinct-laya-wasm.csv","id,category,ok,ms,choice,error\n"+s.map(x=>[x.id,x.category,x.ok,x.ms,x.choice||"",JSON.stringify(x.error||"")].join(",")).join("\n"),"text/csv")};
