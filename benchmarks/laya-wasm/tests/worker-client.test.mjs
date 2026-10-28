import test from 'node:test';
import assert from 'node:assert/strict';
const { WorkerClient } = await import('../src/worker-client.js').catch(()=>({}));
class WorkerDouble {
 terminated=false;
 postMessage(message){this.request=message;}
 terminate(){this.terminated=true;}
 reply(data){this.onmessage({data:{id:this.request.id,...data}});}
}
test('worker timeout terminates inference and refuses later requests',async()=>{
 assert.equal(typeof WorkerClient,'function');
 const worker=new WorkerDouble(); const client=new WorkerClient(worker);
 await assert.rejects(client.request('predict',{},5),/timed out/);
 assert.equal(worker.terminated,true);
 await assert.rejects(client.request('predict',{},5),/stopped/);
});
test('worker result and progress are routed without finishing early',async()=>{
 assert.equal(typeof WorkerClient,'function');
 const worker=new WorkerDouble(); const client=new WorkerClient(worker); const updates=[];
 const result=client.request('load',{},1000,p=>updates.push(p));
 worker.reply({progress:'config'}); worker.reply({result:{ready:true}});
 assert.deepEqual(await result,{ready:true}); assert.deepEqual(updates,['config']);
 client.stop();
});
test('worker crash rejects outstanding operation',async()=>{
 assert.equal(typeof WorkerClient,'function');
 const worker=new WorkerDouble(); const client=new WorkerClient(worker);
 const result=client.request('load',{},1000);
 worker.onerror({message:'WASM crash',preventDefault(){}});
 await assert.rejects(result,/WASM crash/); assert.equal(worker.terminated,true);
});
