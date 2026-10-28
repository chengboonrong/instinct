import { Agent } from 'laya-ts';
import * as ort from 'onnxruntime-web/wasm';
import { readPrediction } from './report.js';
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths=new URL('/wasm/',self.location.origin).href;
let agent;
self.onmessage=async({data:{id,type,payload}})=>{
 try {
  let result;
  if(type==='load') {
   agent=await Agent.load(payload.modelBaseUrl,{
    numThreads:1,expectedSha256:payload.expectedSha256,
    onProgress:(done,total,file)=>self.postMessage({id,progress:{done,total,file}}),
   });
   result={ready:true,runtimeVersion:'1.20.0',threads:1};
  } else if(type==='predict') {
   if(!agent)throw new Error('Model is not loaded');
   const start=performance.now();
   result={...readPrediction(await agent.predict(payload.state,payload.question),payload),ms:performance.now()-start};
  } else throw new Error('Unknown worker operation');
  const resources=performance.getEntriesByType('resource').filter(entry=>/onnx|tokenizer|rl_agent_config/.test(entry.name));
  const transferBytes=resources.reduce((sum,entry)=>sum+(entry.transferSize||0),0);
  self.postMessage({id,result:{...result,downloadBytes:transferBytes||null}});
 }catch(error){self.postMessage({id,error:String(error?.stack||error)});}
};
