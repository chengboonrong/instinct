# Instinct Laya WASM benchmark — iPhone 15 Plus

**Status:** browser bundle passes CI at prior revision; new WASM import/asset changes are under CI verification. Full checkpoint export, model load and physical iPhone measurements remain **unverified**. Do not report simulated device results.

## 1. Build the browser harness

From `benchmarks/laya-wasm` (requires Node 22, Git):

```bash
npm run bootstrap
npm install --no-audit --no-fund
npm run build
```

`bootstrap` clones Laya at pinned upstream code commit `b9fe351ce81e2d974bca2bf219c1e4030c0a05ea`, builds its otherwise-unpublished `laya-ts` package, and installs it as a local file dependency. The install/build step patches the compiled provider **fail-closed**: the encoder and head request WASM and the browser ONNX import becomes statically resolvable by Vite. The WebAssembly runtime binaries are copied to `public/wasm/` at dev/build time. Do not use the benchmark if the patch aborts.

`onnxruntime-web` is explicitly pinned to 1.20.0 for this experiment; the app initializes `ort.env.wasm.numThreads=1` and the public WASM asset prefix before calling Laya.

## 2. Export and validate actual model weights

The repository deliberately does **not** contain ONNX model weights. The split ONNX files are different from the community's fused ONNX checkpoint and are required by `laya-ts`.

From the same directory, using a Python environment with sufficient disk space and RAM:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e vendor/laya onnxscript onnxruntime huggingface_hub
.venv/bin/python scripts/export-model.py
```

The script downloads the upstream **English** checkpoint pinned to revision `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`, invokes the upstream split exporter *with Torch-versus-ONNX parity verification enabled*, and checks file existence/JSON structure/SHA256 in `public/models/laya/manifest.json`. Export also writes `source.json` documenting model origin.

Expect gigabytes of data and significant memory usage. The original checkpoint is **not optimized for iPhone Safari**; a model-load failure or tab kill is a valid feasibility result. Do not upload the weights or produced model artifacts to the Instinct Git repository.

To revalidate artifacts without exporting:

```bash
.venv/bin/python scripts/check-model.py public/models/laya
```

## 3. Serve HTTPS and collect results on the real device

```bash
npm run dev
```

Serve through an appropriately secured HTTPS endpoint or authenticated HTTPS tunnel accessible from your physical iPhone 15 Plus. Record exact iOS and Safari versions, model manifest, browser capability flags, network profile and whether the cache is cold. Confirm through Safari Web Inspector that only WASM is used. The webpage's `backendVerified` field records the build-time source patch, **not** direct runtime execution-provider introspection.

Tap **Load & benchmark 100**, export JSON and CSV, then run **10-minute soak** and export again. Do not switch tabs or lock the screen. The workload uses 40 combat, 25 traffic, 20 social and 15 mission decisions.

## Current prototype limitations

- CI builds JavaScript and copies WASM assets; it does **not** load actual ONNX checkpoints or prove Safari inference.
- The 35-box Three.js scene is a micro-scene workload, **not a KL Rush performance proxy**.
- No curated truth labels: accuracy remains unmeasured, and confidence is not ground-truth accuracy.
- Network transfer sizes may be absent with cached/cross-origin resources; unavailable must remain null.
- Browser memory and thermal data are not automatically obtainable; capture manual observations separately.
- Current sustained test doesn't persist partial progress if Safari terminates the tab.
- Cold start measures initialization, not a rigorously cache-cleared network run.
- There is no rendering-only baseline yet; FPS impact must not be reported as a relative regression.
- The chosen model revision, runtime versions and exported-artifact hashes must accompany any results.
- Do not claim mobile readiness until actual WASM inference and the full 10-minute run succeed.

## Benchmark protocol

See [research protocol](../../docs/research/laya-iphone15-plus-wasm-benchmark.md).

## Faster model setup: verified pre-exported split ONNX (WASM baseline)

A third-party [pre-exported multilingual Laya checkpoint](https://huggingface.co/pleveneur/laya-multilingual-onnx) is available in the **split encoder/head format** required by this benchmark. This can avoid the resource-intensive PyTorch export step. The model card lists all four file SHA-256 digests. This is an independently published conversion, not an official upstream artifact. Its compatibility is not yet validated on Safari.

**First try this path instead of the PyTorch exporter:**

```bash
python3 -m pip install huggingface_hub
python3 scripts/fetch-split-onnx.py --dry-run
python3 scripts/fetch-split-onnx.py
npm run dev
```

The fetch script resolves an immutable Hugging Face commit, verifies file lengths and the four publisher-reported SHA-256 digests, copies the model into the untracked `public/models/laya/` directory, and writes `source.json` and `manifest.json`. No weights are committed. It will download **approximately 1.23 GiB** and need additional disk space. This model is **multilingual** (322M parameters), whereas `scripts/export-model.py` generates the **English** (421M) model. Record the variant in comparisons.

Even with verified hashes, the published model is huge for Safari WASM. **The model may fail to load or Safari may terminate the page.** This would be a genuine feasibility result, not a benchmark success. Do not report model correctness or latency until the physical iPhone executes actual inferences.

If avoiding third-party exports is preferred, use the pinned PyTorch export path in section 2 above instead.
