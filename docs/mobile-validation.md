# Mobile Safari & AI performance validation

This milestone provides **two different kinds of evidence**. They must not be conflated:

1. **Linux Playwright WebKit**: browser compatibility, including an iPhone 13-sized viewport with touch input. It is not an iPhone device and its graphics driver/memory stack is different.
2. **Synthetic Node.js CPU benchmark**: fixed-step Behavior Tree and AI scheduler update cost for 50 and 250 simulated agents. It does not measure three.js WebGL draw cost or iOS thermals.

## Automated compatibility checks

```sh
npm ci
npm run build
npx playwright install --with-deps --only-shell chromium webkit
npm run test:e2e
```

The Playwright config uses Desktop Chrome, Desktop Safari (WebKit) and a WebKit project with an iPhone 13 viewport/touch profile. The focus/blur regression test dispatches synthetic events; it **does not** suspend Safari or reproduce an OS backgrounding lifecycle. The mobile project runs the dedicated `tests/browser/mobile.spec.ts` file only. The full desktop flow exercises live game → local relay → Studio; the mobile tests exercise the game and its tap-friendly controls. **Behavior Studio itself remains desktop-oriented; its CSS has a minimum width of 860 px.**

## Synthetic CPU benchmark

```sh
npm run build
npm run bench:ai
node scripts/benchmark-ai.mjs --agents=50,250 --frames=1200
```

The benchmark prints JSON with per-frame scheduler execution timing (mean/p50/p95/p99/max, milliseconds), actual AI updates, and the capped catch-up result after a simulated five-second tab suspension. No universal CPU threshold is enforced on a shared GitHub runner; save a baseline and compare against the same hardware/Node environment over time. It intentionally runs with debug tracing **disabled**.

## Real iPhone Safari sign-off checklist

1. Serve the **game/demo** over HTTPS accessible from the phone. The development WebSocket relay intentionally binds to loopback and should NOT be opened to the network or shipped with a public build. Use the local demo for display/perf profiling without the relay.
2. On real iPhone Safari (and ideally a low-memory device), measure 10-minute and 30-minute sessions, foreground/background recovery, motion control/touch response and browser reload behavior.
3. Record frame rate, long frames/p99 frame duration, battery/thermal throttling, WebGL context-loss/restoration events, real texture count, object count and network payloads. The demo HUD only reports **approximate** FPS/CPU render time, AI update counts, texture count and context-loss events. It is not a GPU profiler.
4. Run 50, 100, 250-agent scenarios using representative game assets and navigation systems. This simple two-NPC demo does not model real KL Rush load.
5. Compare traced vs untraced builds, WebGL2 fallback behavior and memory retention over reload/recovery. Capture device model, iOS/Safari versions, settings and reproducible reproduction steps.

**Release gate:** do not call Instinct iPhone-validated until real device evidence is attached to the PR. These CI tests reduce compatibility risk but are not a substitute.
