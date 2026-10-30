// Optional real-model execution test on desktop Node WASM. Never a device benchmark.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as ort from '../node_modules/onnxruntime-web/dist/ort.wasm.min.mjs';
import {Agent,parseTokenizerJson,encodeWithData,feed,feedHead} from 'laya-ts';
import {fixtures} from '../src/fixtures.js';
import {readPrediction} from '../src/report.js';
execFileSync('python3',['scripts/check-model.py','public/models/laya','--verify'],{stdio:'inherit'});
console.log('Desktop Node WASM smoke; NOT Safari, NOT iPhone, NOT numerical parity.');
assert.equal(ort.env.versions.web,'1.20.0');
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('../node_modules/onnxruntime-web/dist/',import.meta.url).pathname;
let encoder,head;
const nested=tensor=>{
 assert.equal(tensor.dims.length,3);
 assert.ok(tensor.data.every(Number.isFinite));
 const [batch,seq,width]=tensor.dims;
 return Array.from({length:batch},(_,b)=>Array.from({length:seq},(_,s)=>Array.from(tensor.data.slice((b*seq+s)*width,(b*seq+s+1)*width))));
};
try {
 encoder=await ort.InferenceSession.create(fs.readFileSync('public/models/laya/encoder.onnx'),{executionProviders:['wasm'],graphOptimizationLevel:'basic'});
 head=await ort.InferenceSession.create(fs.readFileSync('public/models/laya/head.onnx'),{executionProviders:['wasm']});
 const data=parseTokenizerJson(JSON.parse(fs.readFileSync('public/models/laya/tokenizer.json','utf8')));
 assert.ok(data,'Real checkpoint tokenizer must parse');
 const tok={clsId:data.ids.cls,sepId:data.ids.sep,maskId:data.ids.mask,padId:data.ids.pad,maskToken:data.maskToken,encode:text=>encodeWithData(data,text)};
 const provider={
  async runEncoder(batch){const out=await encoder.run(feed(ort,batch));return {lastHidden:nested(out.last_hidden_state)};},
  async runHead(hidden,batch){const out=await head.run(feedHead(ort,hidden,batch));
   const rows=tensor=>{assert.ok(tensor.data.every(Number.isFinite));const width=tensor.dims[1];return Array.from({length:tensor.dims[0]},(_,i)=>Array.from(tensor.data.slice(i*width,(i+1)*width)));};
   return {logits:rows(out.logits),act:rows(out.act_logits)};
  },
 };
 const agent=new Agent({provider,tok,cfg:JSON.parse(fs.readFileSync('public/models/laya/rl_agent_config.json','utf8'))});
 for(const category of ['combat','traffic','social','mission']) {
  const fixture=fixtures.find(item=>item.category===category);
  readPrediction(await agent.predict(fixture.state,fixture.question),fixture);
  console.log('PASS real tokenization / encoder / head / decode:',category);
 }
 console.log('PASS four-category desktop WASM integration smoke. No timings collected.');
}finally{await encoder?.release();await head?.release();}
