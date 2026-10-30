import fs from "node:fs";
import path from "node:path";

const source = path.resolve("node_modules/onnxruntime-web/dist");
const dest = path.resolve("public/wasm");
if (!fs.existsSync(source)) throw new Error("onnxruntime-web missing; install dependencies first");
const assets = fs.readdirSync(source).filter(name => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(name));
if (!assets.length) throw new Error("No ONNX Runtime WASM binaries found; refusing to build");
fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(dest)) {
  if (name.startsWith("ort-wasm") && !assets.includes(name)) fs.rmSync(path.join(dest, name));
}
for (const name of assets) {
  fs.copyFileSync(path.join(source, name), path.join(dest, name));
}
console.log(`Published ${assets.length} ONNX Runtime WASM binaries to public/wasm/.`);
