import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverReport} from '../src/report.js';
const {diagnosticFetch,recordLoadEvent}=await import('../src/load-diagnostics.js').catch(()=>({}));

test('download diagnostics preserve streamed bytes and report headers and final length',async()=>{
 assert.equal(typeof diagnosticFetch,'function');
 const events=[];
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3]));c.close();}});
 const fetcher=diagnosticFetch(async()=>new Response(stream,{headers:{'content-length':'3','x-repo-commit':'pinned'}}),e=>events.push(e),()=>0);
 const response=await fetcher('https://example.test/encoder.onnx?token=secret');
 assert.equal(response.headers.get('x-repo-commit'),'pinned');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
 assert.equal(events[0].stage,'fetch-start');
 assert.equal(events.some(e=>e.stage==='response-headers'&&e.httpStatus===200),true);
 const last=events.at(-1);
 assert.equal(last.stage,'download-complete');assert.equal(last.receivedBytes,3);assert.equal(last.totalBytes,3);
 assert.equal(JSON.stringify(events).includes('secret'),false);
});
test('failed streams retain partial byte counts and original errors',async()=>{
 assert.equal(typeof diagnosticFetch,'function');
 const events=[];let reads=0;
 const stream=new ReadableStream({pull(c){if(reads++===0)c.enqueue(new Uint8Array([1,2]));else c.error(new Error('connection lost'));}});
 const response=await diagnosticFetch(async()=>new Response(stream),e=>events.push(e))('https://example.test/head.onnx');
 await assert.rejects(response.arrayBuffer(),/connection lost/);
 assert.equal(events.at(-1).stage,'download-error');assert.equal(events.at(-1).receivedBytes,2);
 assert.equal(events.at(-1).totalBytes,null);assert.match(events.at(-1).error,/connection lost/);
});
test('HTTP and network failures remain available to the report',async()=>{
 assert.equal(typeof diagnosticFetch,'function');
 const events=[];
 const response=await diagnosticFetch(async()=>new Response('missing',{status:404}),e=>events.push(e))('https://example.test/encoder.onnx.data');
 assert.equal(response.status,404);assert.equal(events.at(-1).httpStatus,404);assert.equal(events.at(-1).stage,'http-error');
 await assert.rejects(diagnosticFetch(async()=>{throw new TypeError('Failed to fetch');},e=>events.push(e))('https://example.test/head.onnx'),/Failed to fetch/);
 assert.equal(events.at(-1).stage,'fetch-error');
});
test('checkpoints retain bounded progress and recovery does not rewrite last activity',()=>{
 assert.equal(typeof recordLoadEvent,'function');
 const report={status:'running',phase:'loading'};
 for(let i=0;i<100;i++)recordLoadEvent(report,{stage:'download',file:'encoder.onnx',receivedBytes:i,totalBytes:null},'2026-10-28T08:00:00Z');
 assert.equal(report.loading.events.length,80);
 assert.equal(report.loading.files['encoder.onnx'].receivedBytes,99);
 assert.equal(report.loading.lastEvent.at,'2026-10-28T08:00:00Z');
 const recovered=recoverReport(JSON.parse(JSON.stringify(report)));
 assert.equal(recovered.status,'interrupted');assert.deepEqual(recovered.loading,report.loading);
});
test('byte updates are throttled while final completion is always emitted',async()=>{
 assert.equal(typeof diagnosticFetch,'function');
 const events=[];let reads=0;
 const stream=new ReadableStream({pull(c){if(reads++<1000)c.enqueue(new Uint8Array([1]));else c.close();}});
 const response=await diagnosticFetch(async()=>new Response(stream),e=>events.push(e),()=>0)('https://example.test/encoder.onnx');
 assert.equal((await response.arrayBuffer()).byteLength,1000);
 assert.ok(events.length<10);assert.equal(events.at(-1).receivedBytes,1000);
});
test('relative runtime URLs resolve and compressed transfer lengths remain unknown',async()=>{
 assert.equal(typeof diagnosticFetch,'function');
 const original=globalThis.location;globalThis.location={href:'https://example.test/'};
 try {
  const events=[];
  const response=await diagnosticFetch(async()=>new Response('decoded',{headers:{'content-length':'3','content-encoding':'gzip'}}),e=>events.push(e))('/wasm/runtime.wasm');
  assert.equal(await response.text(),'decoded');assert.equal(events.at(-1).totalBytes,null);
  assert.equal(events[0].url,'https://example.test/wasm/runtime.wasm');
 }finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
});
