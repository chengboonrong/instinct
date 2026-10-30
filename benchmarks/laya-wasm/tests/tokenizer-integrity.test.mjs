import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadWebBundle} from 'laya-ts';
test('missing pinned tokenizer never falls back to an unverified alternate',async()=>{
 const original=globalThis.fetch;const requests=[];
 const hash=createHash('sha256').update('{}').digest('hex');
 globalThis.fetch=async url=>{
  requests.push(String(url));
  if(String(url).endsWith('/rl_agent_config.json'))return new Response('{}');
  if(String(url).endsWith('/tokenizer/tokenizer.json'))return new Response('{"unverified":true}');
  return new Response('missing',{status:404});
 };
 try {
  const bundle=await loadWebBundle('https://example.test/pinned',{expectedSha256:{'rl_agent_config.json':hash,'tokenizer.json':'0'.repeat(64)}});
  assert.equal(bundle.tokenizerJson,null,'Unchecked alternate tokenizer must never be accepted');
  assert.equal(requests.some(url=>url.endsWith('/tokenizer/tokenizer.json')),false);
 }finally{globalThis.fetch=original;}
});
