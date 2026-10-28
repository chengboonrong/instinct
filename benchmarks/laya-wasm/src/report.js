export const round = value => value == null ? null : Math.round(value * 100) / 100;
export function percentile(values, p) {
 if (!values.length) return null;
 const sorted = [...values].sort((a,b)=>a-b);
 return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
}
export function summarize(samples) {
 const successes = samples.filter(s=>s.ok && Number.isFinite(s.ms)).map(s=>s.ms);
 return {attempted:samples.length,successes:successes.length,failures:samples.length-successes.length,
 failureRate:samples.length ? (samples.length-successes.length)/samples.length : null,
 p50Ms:round(percentile(successes,.5)),p95Ms:round(percentile(successes,.95)),p99Ms:round(percentile(successes,.99))};
}
export function frameSummary(intervals) {
 const values=intervals.filter(x=>Number.isFinite(x)&&x>0);
 return {frames:values.length,frameTimeP95Ms:round(percentile(values,.95)),
 medianFps:values.length?round(1000/percentile(values,.5)):null,
 fpsEstimate:values.length?round(1000/(values.reduce((a,b)=>a+b,0)/values.length)):null,
 framesOver33ms:values.filter(x=>x>1000/30).length,framesOver50ms:values.filter(x=>x>50).length};
}
export function readPrediction(output, fixture) {
 const answer=output?.answers?.action;
 if (!answer || !Object.hasOwn(fixture.question.action.criteria,answer.choice)) throw new Error('Invalid model choice');
 if (!Number.isFinite(answer.confidence)||answer.confidence<0||answer.confidence>1) throw new Error('Invalid confidence');
 return {choice:answer.choice,confidence:answer.confidence};
}
const csvCell=value=>{
 const text=value==null?'':String(value);
 // Escape spreadsheet formulas as well as RFC 4180 delimiters.
 const safe=/^[=+@-]/.test(text)?"'"+text:text;
 return /[",\r\n]/.test(safe)?'"'+safe.replaceAll('"','""')+'"':safe;
};
export function toCsv(report) {
 const columns=['phase','id','category','ok','ms','choice','confidence','error'];
 const rows=['inference','sustained'].flatMap(phase=>(report[phase]?.samples??[]).map(sample=>columns.map(key=>csvCell(key==='phase'?phase:sample[key])).join(',')));
 return columns.join(',')+'\r\n'+rows.join('\r\n');
}
export function minuteWindows(samples, durationMs) {
 return Array.from({length:Math.max(1,Math.ceil(durationMs/60000))},(_,index)=>({startSeconds:index*60,endSeconds:Math.min((index+1)*60,durationMs/1000),summary:summarize(samples.filter(s=>s.elapsedMs>=index*60000&&s.elapsedMs<(index+1)*60000))}));
}
export function recoverReport(saved) {
 const report=structuredClone(saved);
 if (report.status==='running' || (report.status==='interrupted' && report.pendingSample)) {
  report.status='interrupted'; report.error='Page closed, reloaded or terminated before completion';
  if(report.sustained) report.sustained.completed=false;
  const phase=report.phase;
  if(report.pendingSample&&report[phase]?.samples) {
   report[phase].samples.push({...report.pendingSample,ok:false,ms:null,error:'Interrupted; elapsed inference time unavailable'});
   Object.assign(report[phase],summarize(report[phase].samples));
  }
  report.pendingSample=null;
 }
 return report;
}
