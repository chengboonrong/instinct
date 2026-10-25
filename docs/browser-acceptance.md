# Automated browser acceptance

Run Instinct's real Three.js ↔ loopback relay ↔ Behavior Studio browser tests locally:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Playwright starts the loopback bridge on 127.0.0.1:7331, Vite's remote two-NPC demo on 127.0.0.1:5174 and Behavior Studio on 127.0.0.1:5173. Tests connect with a **development-only fixed token** on the ephemeral CI runner, never a deployed secret.

The suite checks: authenticated game and Studio connections, two NPCs in the roster, actual node statuses and Blackboard data from a selected NPC, an in-game damage event causing the target NPC to retreat, editor read-only restrictions, disconnect/reconnect and cached frame restoration, rejection of the wrong token, and preservation of the local Step preview.

The CI browser job uses a pinned Playwright version and a software-rendered **headless Chromium** image. This verifies a particular Linux browser environment, **not** real iPhone Safari, and does not certify gameplay frame times, networking security, or GPU memory budgets. Failed tests retain screenshots, video and traces for review.

If any check fails, the branch must remain a draft and the failure should be fixed rather than hidden by a test skip. Do not run the development bridge on a public interface.
