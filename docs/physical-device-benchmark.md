# Physical-device benchmark harness

This standalone Three.js page is a **measurement tool**, not certification. It creates 50, 100, 250 or 500 placeholder NPCs, evaluates Instinct behavior trees with 20 Hz / 5 Hz scheduling, and renders shared geometry using one Three.js instanced mesh. It has **no network telemetry**, no remote debugger connection and no external art assets.

## Run on a Mac and open from a physical iPhone

1. Check out `feat/mobile-benchmark-harness`, then run `npm ci && npm run build`.
2. On a **trusted private LAN**, run `npm run dev:mobile --workspace=@instinct/example-remote`. This intentionally exposes the Vite development server to devices on your network; stop it after testing. Never expose the Vite dev server directly to the internet.
3. Find the Mac's private LAN address and open `http://<Mac-LAN-IP>:5174/benchmark.html` in iPhone Safari. Use the same route on desktop for comparison.
4. Record your actual iPhone/iPad device model, iOS build, Safari version, battery/thermal state, and settings. Start with a 30-second smoke test, then run 10- and 30-minute sessions at each agent count. Keep the screen active.
5. Press **Stop and generate report** or allow the selected duration to finish. Use **Download JSON** or **Copy JSON**. If iOS Safari blocks the download or clipboard (insecure HTTP origin), select and manually copy the report textarea.
6. Attach the JSON and observation notes to [release gate issue #12](https://github.com/chengboonrong/instinct/issues/12).

A deployable static artifact can also be built using:

```sh
npm run build:mobile --workspace=@instinct/example-remote
```

Host the resulting `examples/three-remote/dist-mobile/` directory on any trusted HTTPS static host. The CI job also uploads a mobile-benchmark-site artifact for inspection/hosting. Uploading an artifact is not the same as publishing a live site.

## Report interpretation

The report includes JSON schema version, time window, user agent, canvas dimensions and pixel ratio, workload size, *requestAnimationFrame* interval average/p50/p95/p99, CPU-side Three.js render-call duration, AI scheduler + matrix update CPU duration, executed AI updates, dropped simulation time, background frame gaps, WebGL context loss/restoration counts, renderer texture and geometry object counts, browser errors, and optionally nonstandard JS-heap usage. It does **not** measure GPU allocations, actual GPU frame time, thermal throttling or total process memory.

The benchmark uses **instanced placeholder geometry and a simple scripted decision workload**, not KL Rush's real textures, skeletal animation, pathfinding or combat AI. Do not directly extrapolate its frame rate or heap numbers to KL Rush. A trace-on run instruments only one NPC (to bound memory overhead).

The event log records observed WebGL context-loss events but does not itself restore lost renderer resources. A real device recovery test is therefore a separate release gate. If the page reloads or Safari is terminated, note it manually: a missing report after a crash is not proof of zero failures.
