// Observe loading without retaining another copy of the model. Byte counts are
// response-body bytes, not wire transfer sizes or proof of hash verification.
export function diagnosticFetch(fetcher,emit,now=()=>performance.now()) {
 return async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,globalThis.location?.href);
  const details={file:url.pathname.split('/').pop(),url:url.origin+url.pathname};
  const send=event=>{try{emit({...details,...event});}catch{/* diagnostics must not break loading */}};
  send({stage:'fetch-start'});
  let response;
  try{response=await fetcher(input,init);}
  catch(error){send({stage:'fetch-error',error:String(error?.stack||error)});throw error;}
  const rawLength=response.headers.get('content-length');
  const length=rawLength===null?NaN:Number(rawLength);
  const encoding=response.headers.get('content-encoding');
  const totalBytes=(!encoding||encoding==='identity')&&Number.isSafeInteger(length)&&length>=0?length:null;
  send({stage:response.ok?'response-headers':'http-error',httpStatus:response.status,totalBytes,receivedBytes:0});
  if(!response.ok||!response.body)return response;
  const reader=response.body.getReader();let receivedBytes=0,lastUpdate=-Infinity;
  const body=new ReadableStream({
   async pull(controller) {
    try {
     const {done,value}=await reader.read();
     if(done){send({stage:'download-complete',receivedBytes,totalBytes});controller.close();return;}
     receivedBytes+=value.byteLength;
     const time=now();
     if(time-lastUpdate>=500){send({stage:'download',receivedBytes,totalBytes});lastUpdate=time;}
     controller.enqueue(value);
    }catch(error){send({stage:'download-error',receivedBytes,totalBytes,error:String(error?.stack||error)});controller.error(error);}
   },
   cancel(reason){send({stage:'download-cancelled',receivedBytes,totalBytes,error:String(reason??'Cancelled')});return reader.cancel(reason);},
  },{highWaterMark:0});
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 };
}

export function recordLoadEvent(report,event,at=new Date().toISOString()) {
 const loading=report.loading??={events:[],files:{},lastEvent:null};
 const entry={...event,at};
 if(entry.error)entry.error=String(entry.error).slice(0,4000);
 loading.lastEvent=entry;loading.events.push(entry);
 if(entry.source==='worker')loading.lastWorkerEvent=entry;
 if(loading.events.length>80)loading.events.splice(0,loading.events.length-80);
 if(entry.file)loading.files[entry.file]={...loading.files[entry.file],...entry};
 return entry;
}
