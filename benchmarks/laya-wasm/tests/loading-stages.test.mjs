import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const patch=path.resolve('scripts/force-wasm.mjs');
test('pinned adapter emits verification and session stages in execution order',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'laya-stages-'));
 const original=globalThis.fetch;const originalWindow=globalThis.window;
 try {
  const dir=path.join(root,'node_modules/laya-ts/dist');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
  fs.writeFileSync(path.join(root,'node_modules/laya-ts/package.json'),'{"type":"module"}');
  fs.cpSync('vendor/laya/laya-ts/dist',dir,{recursive:true});
  const ort=path.join(root,'node_modules/onnxruntime-web');fs.mkdirSync(ort,{recursive:true});
  fs.writeFileSync(path.join(ort,'package.json'),'{"type":"module","exports":{"./wasm":"./wasm.mjs"}}');
  fs.writeFileSync(path.join(ort,'wasm.mjs'),'export const env={};export const InferenceSession={create:async(bytes,options)=>{if(options.executionProviders.join()!=="wasm")throw Error("Unexpected backend");return {};}};');
  for(let i=0;i<2;i++)assert.equal(spawnSync(process.execPath,[patch],{cwd:root,encoding:'utf8'}).status,0);
  const {createWebProvider}=await import(pathToFileURL(path.join(dir,'providers.js')));
  globalThis.fetch=async url=>String(url).endsWith('.data')?new Response('',{status:404}):new Response('x');
  const stages=[];
  await createWebProvider('https://example.test/pinned',{expectedSha256:{},onProgress:(_done,_total,file)=>{if(typeof file==='object')stages.push(file);}});
  assert.deepEqual(stages.map(({stage,file})=>[stage,file]),[
   ['verify-start','encoder.onnx'],['verified','encoder.onnx'],
   ['verify-start','head.onnx'],['verified','head.onnx'],
   ['session-create','encoder.onnx'],['session-ready','encoder.onnx'],
   ['session-create','head.onnx'],['session-ready','head.onnx'],
  ]);
  // Exercise the Agent boundary too: provider callbacks must reach the caller.
  globalThis.window={};
  globalThis.fetch=async url=>String(url).endsWith('.data')?new Response('',{status:404}):new Response(String(url).endsWith('.json')?'{}':'x');
  const {Agent}=await import(pathToFileURL(path.join(dir,'agent.js')));
  const forwarded=[];
  await assert.rejects(Agent.load('https://example.test/pinned',{expectedSha256:{},onProgress:(_done,_total,file)=>{if(typeof file==='object')forwarded.push(file);}}),/tokenizer/);
  assert.equal(forwarded.some(e=>e.stage==='session-ready'&&e.file==='head.onnx'),true);
 }finally{globalThis.fetch=original;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;fs.rmSync(root,{recursive:true,force:true});}
});
