import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const script=path.resolve('scripts/force-wasm.mjs');
test('patch selects WASM and browser path inside worker; repeated patch is safe',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'laya-patch-'));
 try {
 const dir=path.join(root,'node_modules/laya-ts/dist');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(root,'node_modules/laya-ts/package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(dir,'providers.js'),'const TOKENIZER_CANDIDATES = ["tokenizer.json", "tokenizer/tokenizer.json"];\nexport function providers(){return {executionProviders: ["webgpu", "wasm"]};}\nexport async function runtime(){const spec = "onnxruntime-" + "web"; const ort = await import(/* @vite-ignore */ spec);return ort;}');
 fs.writeFileSync(path.join(dir,'agent.js'),'export function browser(){const isBrowser = typeof globalThis.window !== "undefined";return isBrowser;}');
 for(let i=0;i<2;i++)assert.equal(spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'}).status,0);
 const providers=await import(pathToFileURL(path.join(dir,'providers.js')));
 assert.deepEqual(providers.providers().executionProviders,['wasm']);
 const agent=await import(pathToFileURL(path.join(dir,'agent.js')));
 globalThis.WorkerGlobalScope=class {};
 try{assert.equal(agent.browser(),true);}finally{delete globalThis.WorkerGlobalScope;}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
