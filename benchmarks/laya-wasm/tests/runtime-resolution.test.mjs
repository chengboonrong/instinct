import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'vite';
test('production worker and Laya share one pinned ONNX runtime',async()=>{
 const seen=new Set();
 const probe=()=>({name:'record-runtime-modules',moduleParsed(info){if(info.id.includes('/onnxruntime-web/dist/ort.')&&info.id.endsWith('.mjs'))seen.add(info.id);}});
 await build({logLevel:'silent',publicDir:false,build:{write:false},worker:{format:'es',plugins:()=>[probe()]}});
 const modules=[...seen];
 assert.equal(modules.length,1,'A single runtime environment must configure all sessions: '+modules.join(', '));
 assert.ok(modules[0].startsWith(path.resolve('node_modules/onnxruntime-web')+'/'),'Runtime must be the root pinned package');
});
