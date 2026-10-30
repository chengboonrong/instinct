export class WorkerClient {
 constructor(worker) {
  this.worker=worker; this.nextId=0; this.pending=new Map(); this.stopped=false;
  worker.onmessage=({data})=>{
   const pending=this.pending.get(data.id); if(!pending)return;
   if(data.progress!==undefined) {pending.progress?.(data.progress);return;}
   clearTimeout(pending.timer);this.pending.delete(data.id);
   if(data.error)pending.reject(new Error(data.error));else pending.resolve(data.result);
  };
  worker.onerror=event=>{
   event.preventDefault?.();
   const location=event.filename?` (${event.filename}:${event.lineno??0}:${event.colno??0})`:'';
   this.stop((event.message||'Inference worker crashed')+location);
  };
  worker.onmessageerror=()=>this.stop('Inference worker message could not be decoded');
 }
 request(type,payload,timeoutMs,onProgress) {
  if(this.stopped)return Promise.reject(new Error('Inference worker stopped; reload model before retrying'));
  if(this.pending.size)return Promise.reject(new Error('Inference operation already running'));
  return new Promise((resolve,reject)=>{
   const id=++this.nextId;
   const timer=setTimeout(()=>this.stop(`${type} timed out after ${timeoutMs} ms`),timeoutMs);
   this.pending.set(id,{resolve,reject,timer,progress:onProgress});
   try{this.worker.postMessage({id,type,payload});}catch(error){this.stop(String(error));}
  });
 }
 stop(reason='Stopped by user') {
  this.stopped=true;this.worker.terminate();
  for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error(reason));}
  this.pending.clear();
 }
}
