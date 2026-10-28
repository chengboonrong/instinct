# Laya benchmark completion implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete and deploy PR #17's reproducible WASM harness, verify downloaded artifacts, and run automated checks.
**Architecture:** Keep upstream Laya pinned, isolate inference in a dedicated browser worker, and checkpoint honest partial reports on the main thread. Host the static harness privately with pinned model URLs if host asset limits prevent bundling weights.
**Tech Stack:** JavaScript, Node test runner, Python unittest, Vite, ONNX Runtime Web 1.20.0.
**Spec:** docs/research/laya-iphone15-plus-wasm-benchmark.md

## Global constraints
- Existing branch research/laya-iphone15-wasm-benchmark only; no merge into main.
- Physical iPhone 15 Plus, Safari, WASM only, one thread, 100 mixed decisions and 600-second sustained run.
- Automated fixture tests and desktop inference are never physical device measurements.
- No weights committed to Instinct; SHA256 verification does not prove numerical parity.

## Review focus
- Hidden/reloaded/killed pages must preserve incomplete status.
- Invalid model outputs and worker timeouts count as failures.
- CSV must export sustained samples and escape delimiters/newlines.
- Model manifests and downloaded files must fail closed on corruption.
- Worker must use browser WASM path, never Node or WebGPU.

### Task 1: Report and worker integrity
- [ ] Add failing Node tests for summaries, per-minute windows, valid predictions, CSV, interruption recovery and worker timeout termination.
- [ ] Implement report helpers, worker client, dedicated inference worker and UI checkpoint lifecycle.
- [ ] Run Node suite and production build; verify browser path and assets.

### Task 2: Model integrity and deployment
- [ ] Add Python tests for missing, empty and corrupted model files; verify independent digests against existing manifests.
- [ ] Download four artifacts and check publisher SHA256/size; inspect ONNX graphs where available.
- [ ] Prepare private HTTPS deployment with immutable model source, artifact manifest, notices and exact source revision.
- [ ] Verify deployment result; document any model initialization or physical-device limits.

### Task 3: Final verification
- [ ] Run every available branch automated suite, build, audit, Python checks and browser QA when supported.
- [ ] Review whole change; commit and push only existing feature branch; update PR description to reflect implemented scope.
