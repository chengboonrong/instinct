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
fs.writeFileSync(file, code);
// Upstream only detects Window; dedicated workers must take its browser loader too.
const agentFile = path.resolve("node_modules/laya-ts/dist/agent.js");
let agentCode = fs.readFileSync(agentFile, "utf8");
const windowCheck = 'const isBrowser = typeof globalThis.window !== "undefined";';
const workerCheck = 'const isBrowser = typeof globalThis.window !== "undefined" || typeof WorkerGlobalScope !== "undefined";';
if (agentCode.includes(windowCheck)) agentCode = agentCode.replace(windowCheck, workerCheck);
else if (!agentCode.includes(workerCheck)) throw new Error("Unexpected Laya browser detection; refusing Node loader in worker");
fs.writeFileSync(agentFile, agentCode);
console.log("Verified Laya browser adapter: WASM-only encoder, Vite-resolvable ONNX Runtime import.");
