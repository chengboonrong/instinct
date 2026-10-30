# Laya WASM feasibility and iPhone 15 Plus benchmark plan

Date: 2026-10-28  
Status: research and test specification — **no physical-device measurements yet**  
Scope: Instinct neural decision provider, iPhone 15 Plus Safari, WASM first

## Findings verified against Laya upstream

Source: https://github.com/NandhaKishorM/laya

- `laya-ts` is an ESM TypeScript package with ONNX browser inference. It loads an encoder and decision head from `encoder.onnx` and `head.onnx` plus `tokenizer.json` and `rl_agent_config.json`.
- `Agent.load(modelUrl, options)` detects browsers and calls `loadWebBundle` / `createWebProvider`; its documented browser call is `await Agent.load("/models/laya")`. The `device` option is **not** passed to `createWebProvider` in the inspected browser load path. Do not claim that `{device:"wasm"}` forces WASM.
- `laya-ts/src/providers.ts` dynamically imports `onnxruntime-web`; pin the runtime version and inspect its actual execution-provider configuration before a benchmark. Record the selected provider in results; fail rather than silently comparing a different backend.
- Laya models are large: upstream README lists 421M parameters for English and 322M for multilingual. Approximate raw FP16 weights alone are 842 MB and 644 MB respectively, excluding ONNX packaging, WASM runtime and activation memory. Browser viability is unproven.
- Upstream GPU latency numbers (T4) must **not** be presented as iPhone Safari or WASM results.
- Laya is a typed decision engine (choice / score / noul), not a pathfinder or combat execution runtime. Keep it an optional strategic provider above deterministic Instinct behavior-tree / utility fallbacks.
- Laya upstream is Apache-2.0; Instinct currently declares MIT. Preserve notices and verify dependencies/checkpoint licensing before redistributing artifacts.

Inspected paths:
- https://github.com/NandhaKishorM/laya/blob/main/laya-ts/README.md
- https://github.com/NandhaKishorM/laya/blob/main/laya-ts/src/agent.ts
- https://github.com/NandhaKishorM/laya/blob/main/laya-ts/src/providers.ts
- https://github.com/NandhaKishorM/laya/blob/main/laya-ts/scripts/export_onnx.py
- https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md

## Frozen v1 device configuration

| Parameter | Value |
|---|---|
| Device | Physical iPhone 15 Plus (A16 Bionic) |
| Browser | Safari (record exact iOS/Safari build) |
| Execution provider | WASM only; verify actual provider |
| Game workload | Mixed |
| Timed inference samples | 100 per backend (40 combat; 25 pedestrians/traffic; 20 social/reaction; 15 mission/environment) |
| Sustained gameplay | 10 minutes after the discrete inference test |
| Results | JSON + CSV, raw samples + summary |
| Future comparisons | Experimental WebGPU and quantized/distilled candidate, *not* part of WASM v1 |

## Required measurements

1. **Cold load:** cache cleared, network transfer and elapsed time until first successful prediction; record compressed/uncompressed transfer bytes when observable.
2. **Warm inference:** record 100 individual `performance.now()` durations, success/failure, predicted labels and confidence (not calibrated game correctness).
3. **Accuracy:** include deterministic fixture IDs, expected labels and a separate correctness tally. Correct labels are human-curated; do not infer correctness from model confidence.
4. **Latency:** nearest-rank p50/p95/p99 from **successful** predictions, with failures counted separately; publish sample count.
5. **Frames:** `requestAnimationFrame` frame intervals, median FPS, frame-time p95, count of frames >33.3ms and >50ms. Compare rendering-only baseline to rendering+inference with equal scene settings.
6. **10-minute sustained:** wall-clock, repeated inference count, p95 by 60-second window, dropped frames and error log. If the page reloads or is killed, record incomplete run, not success.
7. **Memory indicators:** use performance memory APIs only if available. If not supported, mark unavailable; use remote Web Inspector/OS diagnostics as manually recorded observations. Do not invent total device RAM usage.
8. **Thermal:** manually log device warmth, brightness, battery %, low power mode, charging state, ambient temperature if measured. Safari does not expose reliable core temperature; label these qualitative.

## Experiment controls

- Run in normal Safari (not simulator) over HTTPS, foreground, with screen awake.
- Save exact repo commit, model SHA256, file sizes, `onnxruntime-web` version and deployment URL.
- Warm-up predictions are **excluded** from the 100 timed samples.
- Default to one WASM thread unless verified and documented; record `crossOriginIsolated`, `SharedArrayBuffer`, `hardwareConcurrency`, and configured WASM threads.
- Run cold and warm tests separately; clear model cache only for cold measurements.
- Keep game state text and candidate descriptions fixed and versioned; randomize fixture order with recorded seed.
- Record abort/error/timeout as failures (never drop unsuccessful requests from failure-rate denominator).
- Don't batch the 100 prompts into a single call when measuring per-decision interactive latency.
- Export structured results before beginning the sustained test, and at the end of the sustained test.

## Suggested result schema

```json
{
  "schemaVersion": "instinct-laya-wasm-v1",
  "device": "iPhone 15 Plus",
  "browser": "Safari",
  "backendRequested": "wasm",
  "backendVerified": null,
  "modelCommit": null,
  "modelSha256": null,
  "coldLoadMs": null,
  "downloadBytes": null,
  "inference": {
    "attempted": 0,
    "successes": 0,
    "failures": 0,
    "p50Ms": null,
    "p95Ms": null,
    "p99Ms": null,
    "samples": []
  },
  "rendering": {
    "baselineFrameP95Ms": null,
    "withInferenceFrameP95Ms": null,
    "fps": null
  },
  "sustained": {
    "durationTargetSeconds": 600,
    "durationMeasuredSeconds": null,
    "completed": false
  },
  "memory": { "browserEstimateBytes": null, "notes": null },
  "thermal": { "observations": null }
}
```

All null values mean **not measured**, not zero.

## Implementation gates (before collecting results)

1. Export the selected checkpoint to ONNX with upstream script, verify PyTorch/ONNX parity and artifact SHA256.
2. Deploy model and ESM browser bundle via HTTPS with appropriate CORS/MIME settings.
3. Explicitly configure WASM execution and verify the actual execution provider. Pin the ONNX Runtime Web artifacts used by the page; do not depend on an implicit fallback.
4. Build the 100-fixture dataset and baseline deterministic Instinct decision provider.
5. Add a benchmark UI that displays failure causes, model transfer progress, device capabilities, live sample count, and JSON/CSV export.
6. Test basic model initialization on the device **before** attempting the 10-minute mixed/rendering test.
7. Only after these gates, compare with a smaller quantized or distilled candidate using the identical fixtures.

## Practical stop conditions

If the model cannot load, Safari kills the tab, or the download/memory footprint is unacceptable, record that as a genuine negative feasibility result. Do **not** substitute desktop measurements or fabricated latency. Proceed to compression/distillation or a server-based decision service rather than hiding the failure.

## Provisional product thresholds (not measurements)

- p95 decision inference <50 ms
- stable >=30 FPS, ideally 60
- p95 frame-time overhead <2 ms
- goal for deployable distilled model <50 MB download
- no silent provider fallback; zero unreported failures

These thresholds are design hypotheses and must be revised based on real iPhone evidence.
