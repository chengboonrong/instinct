import test from 'node:test';
import assert from 'node:assert/strict';
const report = await import('../src/report.js').catch(() => ({}));

test('successful latency quantiles exclude failures and include failure rate', () => {
 assert.equal(typeof report.summarize, 'function');
 assert.deepEqual(report.summarize([{ok:true,ms:10},{ok:false,ms:999},{ok:true,ms:30}]), {attempted:3,successes:2,failures:1,failureRate:1/3,p50Ms:10,p95Ms:30,p99Ms:30});
 assert.equal(report.summarize([]).p95Ms,null);
});
test('frames include median FPS and both missed-frame thresholds', () => {
 assert.equal(typeof report.frameSummary,'function');
 assert.deepEqual(report.frameSummary([10,20,40,60]),{frames:4,frameTimeP95Ms:60,medianFps:50,fpsEstimate:30.77,framesOver33ms:2,framesOver50ms:1});
});
test('invalid choice and nonfinite confidence are failed predictions', () => {
 assert.equal(typeof report.readPrediction,'function');
 const fixture={question:{action:{criteria:{cover:'Cover'}}}};
 assert.throws(()=>report.readPrediction({answers:{action:{choice:'attack',confidence:.8}}},fixture),/choice/);
 assert.throws(()=>report.readPrediction({answers:{action:{choice:'cover',confidence:NaN}}},fixture),/confidence/);
 assert.deepEqual(report.readPrediction({answers:{action:{choice:'cover',confidence:.8}}},fixture),{choice:'cover',confidence:.8});
});
test('CSV includes discrete and sustained samples, escapes commas, quotes and newlines', () => {
 assert.equal(typeof report.toCsv,'function');
 const text=report.toCsv({inference:{samples:[{id:'a',category:'combat',ok:true,ms:2,choice:'cover'}]},sustained:{samples:[{id:'b',category:'social',ok:false,ms:3,error:'bad, "x"\nnext'}]}});
 assert.match(text,/inference,a,combat,true,2,cover/);
 assert.match(text,/sustained,b,social,false,3,,,"bad, ""x""\nnext"/);
});
test('minute windows assign exact boundary to next window and retain failures',()=>{
 assert.equal(typeof report.minuteWindows,'function');
 const windows=report.minuteWindows([{ok:true,ms:10,elapsedMs:59999},{ok:false,ms:20,elapsedMs:60000}],120000);
 assert.equal(windows.length,2); assert.equal(windows[0].summary.successes,1); assert.equal(windows[1].summary.failures,1);
});
test('recovered active checkpoint is incomplete and pending sample is recorded as interrupted',()=>{
 assert.equal(typeof report.recoverReport,'function');
 const recovered=report.recoverReport({status:'running',phase:'sustained',sustained:{completed:false,samples:[]},pendingSample:{id:'x',category:'combat',elapsedMs:10}});
 assert.equal(recovered.status,'interrupted'); assert.equal(recovered.sustained.completed,false);
 assert.equal(recovered.sustained.samples[0].ok,false); assert.equal(recovered.sustained.samples[0].ms,null);
 assert.equal(report.recoverReport({status:'complete'}).status,'complete');
});
test('pagehide checkpoint includes pending failure even after interrupt status was saved',()=>{
 const recovered=report.recoverReport({status:'interrupted',phase:'inference',inference:{samples:[]},pendingSample:{id:'pending',category:'combat',elapsedMs:25}});
 assert.equal(recovered.inference.failures,1);assert.equal(recovered.inference.samples[0].ms,null);assert.equal(recovered.pendingSample,null);
});
