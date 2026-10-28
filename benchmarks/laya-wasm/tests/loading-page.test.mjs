import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {WorkerClient} from '../src/worker-client.js';
import * as reports from '../src/report.js';
import {recordLoadEvent} from '../src/load-diagnostics.js';

test('page saves worker progress and separate heartbeat before a loading interruption',async()=>{
 const elements=new Map();const listeners={};const storage=new Map();const intervals=new Map();let worker;
 const element=id=>{if(!elements.has(id))elements.set(id,{checked:false,value:'',textContent:'',disabled:false});return elements.get(id);};
 const document={getElementById:element,hidden:false,addEventListener:(name,callback)=>listeners[name]=callback};
 class FakeWorker {
  constructor(){worker=this;}
  postMessage(message){this.id=message.id;}
  terminate(){this.terminated=true;}
  progress(event){this.onmessage({data:{id:this.id,progress:event}});}
 }
 const context=vm.createContext({document,window:{addEventListener:(name,callback)=>listeners[name]=callback},
  navigator:{userAgent:'test Safari',hardwareConcurrency:4},location:{href:'https://example.test/'},isSecureContext:true,crossOriginIsolated:false,
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  fetch:async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?{files:['encoder.onnx','head.onnx','tokenizer.json','rl_agent_config.json'].map(name=>({name,bytes:1,sha256:'0'.repeat(64)}))}:{})),
  ...reports,recordLoadEvent,WorkerClient,Worker:FakeWorker,URL,performance,Date,SharedArrayBuffer:undefined,
  setTimeout,clearTimeout,setInterval:fn=>{const id=intervals.size+1;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
 });
 const source=fs.readFileSync('src/main.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.env','({})').replaceAll('import.meta.url','"https://example.test/main.js"');
 vm.runInContext(source,context);
 const running=element('start').onclick();await new Promise(setImmediate);
 try {
 assert.ok(worker,'loading should create the worker');
 worker.progress({source:'worker',stage:'download',file:'encoder.onnx',receivedBytes:123,totalBytes:1000});
 const saved=()=>JSON.parse(storage.values().next().value);
 assert.equal(saved().loading?.lastWorkerEvent?.receivedBytes,123);
 assert.match(element('status').textContent,/123/);
 for(const tick of intervals.values())tick();
 assert.ok(saved().loading.pageHeartbeatAt);assert.equal(saved().loading.lastWorkerEvent.stage,'download');
 document.hidden=true;listeners.visibilitychange();await running;
 assert.equal(saved().status,'interrupted');assert.equal(saved().loading.lastWorkerEvent.receivedBytes,123);
 assert.equal(intervals.size,0,'loading heartbeat must stop after failure');
 }finally{worker?.onerror({message:'test cleanup'});await running;}
});
