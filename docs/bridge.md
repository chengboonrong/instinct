# Local Live Game ↔ Studio Bridge (experimental)

Instinct's first **live game ↔ editor** connection is development-only and read-only. It streams the real node trace and visible Blackboard snapshot of two opt-in agents in a running Three.js scene. This is not a KL Rush integration or a production deployment.

## Quick start (three terminals)

Check out `feat/local-debug-bridge` and run:

```bash
npm install
npm run typecheck
npm run build

# Terminal A: starts WebSocket relay on 127.0.0.1:7331
npm run dev --workspace=@instinct/bridge-server

# Terminal B: game at http://127.0.0.1:5174
npm run dev --workspace=@instinct/example-remote

# Terminal C: Studio at http://127.0.0.1:5173
npm run dev --workspace=@instinct/editor
```

The relay prints a randomly generated session token. **Copy that token manually into the game and Studio password fields**, then click Connect in both. In Studio select "Market Guard" or "Rooftop Guard" from the agent dropdown. The tree changes to the selected NPC's **actual versioned behavior definition**. The editor displays node highlights, trace history and Blackboard values from that agent. The remote graph is **read-only**; authoring resumes on local sandbox selection.

In the game, use WASD/arrow keys to move the blue player and trigger chase; press **1** to damage Market Guard and **2** for Rooftop Guard. Guards switch to the retreat branch at less than 30 HP. Browser render frames and AI ticks run independently.

## Security and limits

- Relay binds exclusively to `127.0.0.1`, refuses non-loopback socket peers and disallows non-local browser origins. There is no public HTTP API. Connections require a **16+ character session token** provided by the local process, sent as an initial authenticated WebSocket message (not in URLs).
- The relay accepts only three message families: handshake, game publish/remove, Studio agent select. **No editor-to-game mutation commands, eval, process execution, file writes, or runtime hot reload**.
- Transport only accepts local `ws://127.0.0.1` or `ws://localhost`. This intentionally does not support remote networks, TLS, production websites, or arbitrary hosts.
- Hard maximum WebSocket payload size 160 KB, maximum 64 registered agents, up to 10 published snapshots/sec/agent, and bounded trace lengths. The Studio validates graph and trace shape before using the data.
- The debug token is only entered manually; the app does not save it to local storage or embed it in the page URL. **Local development WebSockets are not encrypted**. This setup is not designed for hostile local processes.
- The editor never executes remotely received task functions: only validates and renders the graph. The game's own compiled task registry decides what to do.
- Blackboard primitive values can expose sensitive information. Enable traces only in controlled development and filter/redact values in future hardening. Never ship the relay token or debug bridge in a public game bundle.

## Integration with other Three.js games

```ts
import {DevtoolsPublisher} from '@instinct/bridge';
import {TraceRecorder} from '@instinct/devtools';
import {compileGraph} from '@instinct/definition';
import {Agent} from '@instinct/core';

const recorder = new TraceRecorder({capacity: 96});
const publisher = new DevtoolsPublisher({token: manuallyEnteredLocalToken});
publisher.connect();
const npc = new Agent(compileGraph(graph, registry, {observer: recorder}), blackboard);
recorder.watchBlackboard(blackboard);

function gameAiTick(dt: number) {
  recorder.beginTick();
  npc.tick(dt);
  publisher.publish({id: 'guard-one', label: 'Guard One', graph, trace: recorder.snapshot()});
}
// On despawn / shutdown:
publisher.remove('guard-one');
npc.stop();
recorder.dispose();
publisher.close();
```

Both the runtime tracing and relay must be explicitly enabled only in development. TraceRecorder is associated with one NPC and its BlackboardStore; compile distinct stateful trees per NPC.

## Gaps before release

- Manual browser and iPhone Safari interaction tests, disconnected/reconnected editor and tab-suspension testing.
- Multi-game agent IDs may collide (server refuses ownership conflicts); future session IDs should namespace them.
- No authenticated remote/mobile device debugging across networks, production telemetry, editor breakpoints, state mutation or save/rewind.
- Investigate dependency security issue #6 before public beta.
