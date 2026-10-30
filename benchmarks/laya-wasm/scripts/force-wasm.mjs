import fs from "node:fs";
import path from "node:path";

// Fail closed when Laya changes how it instantiates ONNX Runtime or selects providers.
// Vite cannot resolve the upstream expression import(/* @vite-ignore */ spec)
// where spec is a computed bare module name.
const file = path.resolve("node_modules/laya-ts/dist/providers.js");
if (!fs.existsSync(file)) throw new Error(`Laya provider missing: ${file}. Run npm run bootstrap first.`);
let code = fs.readFileSync(file, "utf8");
const originalCandidates = 'const TOKENIZER_CANDIDATES = ["tokenizer.json", "tokenizer/tokenizer.json"];';
const pinnedCandidates = 'const TOKENIZER_CANDIDATES = ["tokenizer.json"];';
if (code.includes(originalCandidates)) code = code.replace(originalCandidates, pinnedCandidates);
else if (!code.includes(pinnedCandidates)) throw new Error("Unexpected tokenizer paths; refusing unchecked fallback");
const originalEp = 'executionProviders: ["webgpu", "wasm"]';
const wasmEp = 'executionProviders: ["wasm"]';
const dynamicImport = /const spec = "onnxruntime-" \+ "web";\s*const ort = await import\(\/\* @vite-ignore \*\/ spec\);/g;
const staticImport = 'const ort = await import("onnxruntime-web/wasm");';
code = code.replace('const ort = await import("onnxruntime-web");', staticImport);

const epCount = code.split(originalEp).length - 1;
if (epCount === 1) {
  code = code.replace(originalEp, wasmEp);
} else if (epCount !== 0 || code.includes('executionProviders: ["webgpu"') || !code.includes(wasmEp)) {
  throw new Error("Unexpected Laya execution-provider source; refusing ambiguous WASM results");
}

const dynamicMatches = [...code.matchAll(dynamicImport)];
if (dynamicMatches.length === 1) {
  code = code.replace(dynamicImport, staticImport);
} else if (dynamicMatches.length !== 0 || !code.includes(staticImport)) {
  throw new Error("Unexpected dynamic browser ONNX import; refusing an unbundled runtime");
}
if (code.includes(originalEp) || code.includes('executionProviders: ["webgpu"')) {
  throw new Error("Laya encoder still references WebGPU; refusing WASM benchmark");
}
// Stage callbacks use the existing private adapter progress channel. Fail closed
// when a pinned statement changes, and remain safe across repeated builds.
if(code.includes('export async function createWebProvider')&&!code.includes('// instinct-load-diagnostics-v1')) {
 const replace=(before,after,count=1)=>{
  if(code.split(before).length-1!==count)throw new Error('Unexpected Laya load stage; refusing incomplete diagnostics: '+before);
  code=code.replaceAll(before,after);
 };
 const event=(stage,file)=>`opts?.onProgress?.(0, 0, { stage: "${stage}", file: ${file} });`;
 replace('await expectDigest(rel, buf, opts.expectedSha256);',`{ ${event('verify-start','rel')} await expectDigest(rel, buf, opts.expectedSha256); ${event('verified','rel')} }`);
 replace('return JSON.parse(new TextDecoder().decode(buf));',`${event('json-parse','rel')}\n        return JSON.parse(new TextDecoder().decode(buf));`);
 for(const [name,buffer] of [['encoder.onnx','encBuf'],['head.onnx','headBuf']]) {
  const digest=`await expectDigest("${name}", ${buffer}, opts.expectedSha256);`;
  replace(digest,`${event('verify-start',JSON.stringify(name))}\n        ${digest}\n        ${event('verified',JSON.stringify(name))}`);
 }
 replace('enc = await ort.InferenceSession.create(new Uint8Array(encBuf), {',`${event('session-create','"encoder.onnx"')}\n        enc = await ort.InferenceSession.create(new Uint8Array(encBuf), {`,2);
 replace('const head = await ort.InferenceSession.create(new Uint8Array(headBuf), {',`${event('session-ready','"encoder.onnx"')}\n    ${event('session-create','"head.onnx"')}\n    const head = await ort.InferenceSession.create(new Uint8Array(headBuf), {`);
 replace('let encWasm = null;',`${event('session-ready','"head.onnx"')}\n    let encWasm = null;`);
 code+='\n// instinct-load-diagnostics-v1\n';
}
fs.writeFileSync(file, code);
// Upstream only detects Window; dedicated workers must take its browser loader too.
const agentFile = path.resolve("node_modules/laya-ts/dist/agent.js");
let agentCode = fs.readFileSync(agentFile, "utf8");
const windowCheck = 'const isBrowser = typeof globalThis.window !== "undefined";';
const workerCheck = 'const isBrowser = typeof globalThis.window !== "undefined" || typeof WorkerGlobalScope !== "undefined";';
if (agentCode.includes(windowCheck)) agentCode = agentCode.replace(windowCheck, workerCheck);
else if (!agentCode.includes(workerCheck)) throw new Error("Unexpected Laya browser detection; refusing Node loader in worker");
if(agentCode.includes('provider = await createWebProvider(dir, {')&&!agentCode.includes('// instinct-provider-progress')) {
 agentCode=agentCode.replace('provider = await createWebProvider(dir, {','provider = await createWebProvider(dir, {\n                onProgress: opts?.onProgress, // instinct-provider-progress');
}
fs.writeFileSync(agentFile, agentCode);
console.log("Verified Laya browser adapter: WASM-only encoder, Vite-resolvable ONNX Runtime import.");
