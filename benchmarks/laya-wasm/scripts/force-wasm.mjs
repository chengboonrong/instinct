import fs from "node:fs";
import path from "node:path";

const p = path.resolve("node_modules/laya-ts/dist/providers.js");
if (!fs.existsSync(p)) throw new Error("laya-ts built provider not found: "+p);
const source = fs.readFileSync(p,"utf8");
const mixed = 'executionProviders: ["webgpu", "wasm"]';
const wasm = 'executionProviders: ["wasm"]';
const occurrences = source.split(mixed).length-1;
if (occurrences===1) {
  fs.writeFileSync(p,source.replace(mixed,wasm));
  console.log("Verified patch: encoder now requests WASM only.");
} else if (occurrences===0 && !source.includes('"webgpu"')) {
  if (!source.includes(wasm)) throw new Error("WASM provider not verifiable");
  console.log("WASM-only provider previously patched; verified.");
} else {
  throw new Error("Provider source unexpected. Refusing benchmark to avoid unverified WebGPU fallback. Occurrences="+occurrences);
}
