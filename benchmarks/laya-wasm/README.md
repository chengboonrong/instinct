# Instinct Laya WASM Safari benchmark (experimental)

**Status:** source prototype committed; not built, deployed or measured on an iPhone. No simulated results.

## Install / run

1. From `benchmarks/laya-wasm`, run `npm run bootstrap` to clone/build upstream Laya from pinned commit `b9fe351ce81e2d974bca2bf219c1e4030c0a05ea`, then run `npm install`. The `laya-ts` package is not published to npm as of this CI test; use the local package source. The `postinstall` script **must successfully patch** installed `laya-ts/dist/providers.js` to force the encoder provider to `["wasm"]`. If it fails, stop; do not benchmark.
2. Export actual model artifacts from upstream Laya (see `laya-ts/scripts/export_onnx.py`). Place `encoder.onnx`, `head.onnx`, `tokenizer.json`, `rl_agent_config.json`, and any external tensor sidecar such as `encoder.onnx.data` under `public/models/laya/`. No weights are committed to Instinct.
3. Run `npm run dev`. The Vite terminal serves a LAN address. For iPhone Safari, use an **HTTPS** hosting configuration with sufficient large-file delivery support, or an authenticated HTTPS tunnel. Do not expose private development services unintentionally.
4. Open site on physical iPhone 15 Plus with Safari, and tap **Load & benchmark 100**. Export JSON and CSV. Then run **10-minute soak** and export again.
5. Run `npm run build` and verify bundling; current upstream dynamic `onnxruntime-web` import may require a local compatibility adjustment. Treat build failure as an open blocker, not as a passed benchmark.

## Explicit limitations and work needed before results are valid

- The WASM patch checks for one exact upstream emitted JS pattern and fails closed on drift. It is not a general supported Laya provider-selection API; pin dependency locks and verify with Safari Web Inspector that WASM was selected.
- `onnxruntime-web` ESM dynamic resolution inside upstream `laya-ts` is not yet tested with this Vite version.
- The lightweight 35-box scene is only a synthetic rendering *workload*, **not fabricated benchmark results** or representative of KL Rush. Label observed FPS as micro-scene FPS until integrated with real gameplay.
- The test has no curated expected labels yet, so **accuracy is not measured**. Prediction confidence is not accuracy.
- `performance.getEntriesByType("resource")` transfer sizes can be zero or incomplete for cached assets; report downloaded bytes as unavailable if so.
- Browser memory and thermal values are not measured by this page; capture manually through developer tools and observations.
- The 10-minute soak records samples in memory; for browser kills, the final export will not exist. Future version should checkpoint partial progress into IndexedDB.
- Stopwatch covers 100 sequential calls after one warmup, **including inference while scene renders**. Cold-load includes checkpoint initialization but not full CDN cache-free verification.
- Keep the physical iPhone in foreground and retain a separate rendering-only baseline. This prototype currently measures only the inference-under-render-load frame series.
- Model-size feasibility is a primary open risk. Report an OOM or tab termination truthfully.
- Do not include any real results without verification of model artifact version/checksum and tested device.

## Spec

See [research protocol](../../docs/research/laya-iphone15-plus-wasm-benchmark.md).
