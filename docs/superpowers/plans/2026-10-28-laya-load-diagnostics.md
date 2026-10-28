# Laya loading diagnostics implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Execute inline on the existing feature branch.

**Goal:** Preserve enough evidence from an interrupted phone load to identify the last download, verification or session stage.

**Architecture:** Instrument fetch streams in the inference worker during loading; emit bounded, throttled diagnostics to the main thread and persist them with existing checkpoints. Extend the pinned adapter with stage callbacks around verification and session creation. Keep main-thread heartbeats separate from worker progress.

**Tech Stack:** JavaScript, Web Streams, dedicated workers, ONNX Runtime Web 1.20.0, Node tests, Vite.

**Spec:** User-approved next steps in this conversation: byte progress, initialization stages, worker errors and last successful checkpoints; existing PR branch and private deployment; no invented phone measurements.

## Global constraints

- Retain `research/laya-iphone15-wasm-benchmark`; keep PR #17 draft and never merge main.
- Preserve pinned model hashes and runtime; diagnostics do not establish successful device inference.
- Do not accumulate model bytes in the diagnostic layer or save them in reports.
- Preserve recovery of v2 reports without diagnostics.

## Review focus

- Stream failures retain partial byte counts and the original error.
- HTTP and network failures are visible even when upstream wraps their messages.
- Unknown Content-Length stays unknown; do not invent percentages.
- Heartbeats never imply worker progress or a completed download.
- Recovery retains bounded history and distinguishes last persisted activity from recovery time.

### Task 1: Persist load diagnostics

Files: `src/load-diagnostics.js`, `tests/load-diagnostics.test.mjs` under `benchmarks/laya-wasm/`.

- [x] Add failing tests for real stream consumption, failed streams, network/HTTP errors, bounded progress and recovery.
- [x] Implement `diagnosticFetch(fetcher, emit, now)` and `recordLoadEvent(report, event, at)`; preserve response bytes and headers.
- [x] Run focused and existing suites.

### Task 2: Wire worker, adapter and UI

Files: `src/inference-worker.js`, `src/main.js`, `src/worker-client.js`, `scripts/force-wasm.mjs`, adapter and worker tests.

- [x] Add failing behavioral tests for adapter stages and detailed worker crashes.
- [x] Emit download, SHA-256, parse and session stages; persist each throttled update and separate page heartbeats.
- [x] Show current file, bytes and stage, and retain error/lifecycle evidence.
- [x] Verify full Node/Python suites, production build, upstream TS tests and package checks.

### Task 3: Deliver

- [x] Document diagnostic interpretation and rerun instructions.
- [ ] Review diff and commit to existing branch; verify GitHub CI.
- [ ] Copy matching built assets to the existing owner-private Site, package and redeploy.
- [ ] Report deployment and verification limits; physical phone run remains user-operated.

Execution record: fresh checkout of the existing feature branch; no new worktree or branch required. Native inline execution authorized by “Go”. Focused regressions failed before implementation, then passed. Final serial run: 22 Node and 5 Python tests; upstream: 1,247 tests plus type and package checks. Production build and audit pass. Independent review approved. Local preview renders and enforces HTTPS; physical Safari inference remains unverified. Source publication and private deployment follow validation.
