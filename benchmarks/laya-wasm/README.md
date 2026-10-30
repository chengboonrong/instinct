# Instinct Laya WASM benchmark — Safari

PR #17 implements a WASM-only browser experiment targeting a **physical iPhone 15 Plus**: 100 mixed decisions (40 combat, 25 traffic, 20 social, 15 mission) and a 600-second sustained run. No physical-device measurements have been collected. The 35-box scene is a micro-scene, not a KL Rush performance proxy.

## Build and tests

Requires Node 22+, Git and Python 3. From this directory:

```bash
npm run bootstrap
npm ci --no-audit --no-fund
npm run test:all
# After downloading model files: npm run test:model (desktop WASM only)
npm run build
```

Laya is pinned to `b9fe351ce81e2d974bca2bf219c1e4030c0a05ea`. The build fails closed if its provider patch no longer applies. The patch selects only WASM, uses a bundler-resolvable runtime import and enables the upstream browser loader in a dedicated worker. Vite forces both worker and Laya to share **ONNX Runtime Web 1.20.0**; a production-build regression test checks the resolution. WASM is configured with one thread. Only the WASM-specific runtime is bundled.

The worker keeps rendering responsive and can be terminated on a 120-second prediction timeout or manual stop. Loading has a 15-minute limit. Timeout durations are explicit experiment stop conditions, not performance targets. Results distinguish worker inference time from main-thread round-trip time.

## Download and verify the model

```bash
python3 -m pip install huggingface_hub
python3 scripts/fetch-split-onnx.py --dry-run
python3 scripts/fetch-split-onnx.py
python3 scripts/check-model.py public/models/laya --verify
```

The downloader pins the third-party `pleveneur/laya-multilingual-onnx` split FP32 model to `43eec88d98b79714f89d2acfdd3efedc88af1739` and checks four published SHA-256 digests and file lengths: **1,324,693,192 bytes (1.23 GiB)**. It writes provenance and a manifest. Weights remain untracked. `check-model.py --verify` compares current bytes with the saved manifest without replacing it. Without `--verify`, it creates a new inventory; that alone is not publisher verification.

The browser passes the manifest digests to Laya so downloaded JSON and ONNX bytes are checked before parsing/session creation. This can require substantial transient memory. Hashes and ONNX structural checks do not establish PyTorch numerical parity or Safari compatibility. The manifest deliberately keeps `verifiedInference: false`.

The alternative English model export remains available in `scripts/export-model.py`; it runs upstream Torch-versus-ONNX parity validation and is a different model variant.

## HTTPS deployment

For local development, `npm run dev` serves the app and local models. Real collection requires HTTPS. To build a harness that fetches pinned model bytes directly from Hugging Face:

```bash
VITE_MODEL_BASE_URL=https://huggingface.co/pleveneur/laya-multilingual-onnx/resolve/43eec88d98b79714f89d2acfdd3efedc88af1739 \
VITE_SOURCE_COMMIT=$(git rev-parse HEAD) npm run build
node scripts/prepare-deployment.mjs /absolute/empty/deployment/dist
```

The deployment copier includes the UI, JavaScript, pinned WASM binaries, manifest, provenance and notices, excluding model weights. Host over HTTPS with JavaScript/WASM MIME types. Model downloads depend on Hugging Face CORS and availability. Cold-cache testing must clear **both site and model-origin caches**; cache state is a manual observation. Resource transfer bytes are null when unavailable, including cross-origin resources without timing permission.

## Device collection

1. Open the deployed HTTPS page on the physical iPhone 15 Plus in normal Safari.
2. Record exact iOS/Safari build, cache state, network, battery, charging, low power mode and qualitative thermal observations. Check the device attestation only on the actual device.
3. Run **Load & benchmark 100**. The first successful prediction is a warm-up, excluded from the 100 timed samples. Export JSON/CSV before the sustained run.
4. Run **10-minute soak**, keeping Safari foreground and the screen awake. Export again.

Reports include seed/versioned fixtures, successful p50/p95/p99, failure rate, rendering-only baseline, median FPS, p95 frame interval and counts above 33.3/50 ms. Sustained reports add per-minute latency windows. CSV includes both phases and escapes delimiters, newlines and spreadsheet formulas.

Reports checkpoint before and after each prediction. Reloaded active runs recover as **interrupted**, with pending predictions recorded as failures with unknown elapsed time. Manual stop, timeout, page hide and backgrounding invalidate completion. Browser storage can fail or be evicted; exports remain necessary. There is no automatic resume of a benchmark across page lifetimes.

### Diagnosing an interrupted load

Loading now checkpoints streamed response-body byte counts (at most twice per second per response), HTTP/network/stream errors, SHA-256 verification, JSON parsing, encoder/head session creation and first prediction. The diagnostic stream passes chunks through without retaining another model-sized buffer. The pinned adapter forwards provider progress through `Agent.load`. Diagnostics are additive to the v2 report; old reports still recover.

Export **JSON**, including for failed runs. `loading.files` retains each file's latest state; `loading.events` keeps the last 80 events; `loading.lastWorkerEvent` identifies the last activity received from the worker. `loading.pageHeartbeatAt` is saved every two seconds during loading, separately from worker progress. A recent page heartbeat with old worker progress shows that the page was active; it does not establish a worker crash. Worker errors include source locations when Safari provides them. All timestamps are observations, not a diagnosis of why iOS terminated a page.

Byte counts describe the consumed response body, not wire traffic or cache state. Missing/compressed Content-Length remains unknown. A completed download is not a verified hash or a ready session. Optional `.onnx.data` sidecar HTTP 404s can be normal for this single-file export; inspect subsequent stages before treating them as fatal. Network/cache fallback can also produce a successful load after a failed request. The instrumentation is active only during model loading; cold-load timings include its overhead.

For the next phone run: export the previous report first, reload the latest deployment, attest the actual device and enter the exact iOS/Safari build, then keep Safari foreground with the screen awake. If loading stops, export JSON immediately; after an involuntary reload, export the recovered checkpoint before starting again. This cannot collect device results remotely. The immediate milestone remains one verified physical-device prediction, followed by the 100-decision run and 600-second soak.

## Limits

- Device identity is user-attested; user-agent text cannot prove an iPhone model.
- `backendVerified` stays null: the source patch constrains sessions, but runtime execution-provider introspection is unavailable. Do not label the experiment ready until actual device inference succeeds and its execution path is inspected.
- Accuracy remains null: the fixtures have no human-curated expected labels. Confidence is not accuracy.
- Safari does not expose reliable total device memory or core temperature. Unavailable values remain null; manual notes are separate.
- A load failure or Safari tab kill is a valid negative feasibility result, not a successful benchmark. Desktop CPU checks are not iPhone measurements.

See [the protocol](../../docs/research/laya-iphone15-plus-wasm-benchmark.md) and [third-party notices](THIRD-PARTY-NOTICES.md).
