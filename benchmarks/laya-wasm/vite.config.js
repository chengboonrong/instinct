import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({
 resolve:{
  dedupe:['onnxruntime-web'],
  // A local file dependency otherwise resolves Laya's optional, newer runtime.
  // Both imports must share the same env object, binary and pinned version.
  alias:[{find:/^onnxruntime-web\/wasm$/,replacement:path.resolve('node_modules/onnxruntime-web/dist/ort.wasm.min.mjs')}],
 },
 worker:{format:'es'},
});
