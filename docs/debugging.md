# Instinct Runtime Debugging (experimental)

PR #6 introduces opt-in node-level tracing in `@instinct/definition`, a bounded event recorder in `@instinct/devtools`, and a local live debugger inside Behavior Studio.

## Run

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev --workspace=@instinct/editor
```

In the editor, open the **Sandbox** panel, select a health level and target detection, then press **Step**. Node outlines display the status from the last AI tick (running/success/failure/aborted). **Play** repeats a 50ms simulated AI tick every 200ms of wall time; **Pause** suspends automatic stepping. Blackboard snapshots and the most recent trace events appear on the right. Graph authoring remains independent of tracing.

## Runtime integration

```ts
import {Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {compileGraph} from '@instinct/definition';
import {TraceRecorder} from '@instinct/devtools';

const memory = new BlackboardStore({health: 100, targetDetected: false});
const recorder = new TraceRecorder({capacity: 256});
const unsubscribe = recorder.watchBlackboard(memory);
const agent = new Agent(compileGraph(myGraph, myRegistry, {observer: recorder}), memory);

recorder.beginTick();
agent.tick(1 / 20);
const trace = recorder.snapshot(); // node status map, bounded events, visible blackboard
unsubscribe();
agent.stop();
recorder.dispose();
```

`compileGraph(graph, registry)` still works without an observer; there is no React/browser code in the runtime packages. Tracing is attached to the **specific compiled tree for one agent**. The recorder must not be shared across unrelated agents unless you intentionally combine their events. The ring buffer is bounded (1–8192 records, 256 by default), and a detached snapshot is returned for UI inspection. Blackboard subscriptions are detached when `dispose()` is invoked.

**Important semantics:** `abort` means a node that previously returned `running` was reset. `beginTick()` clears visual statuses but retains bounded historical events. Inspecting a graph does not imply any server connection. The current editor debugger runs **only against its local test NPC**, not against the live KL Rush game or a remote worker. There is no network transport or remote game attach in this PR. `previewValue` displays primitives and uses placeholders for objects rather than holding arbitrary scene-graph references. Trace entries may contain values from the blackboard and are not automatically redacted; **do not enable or expose this instrumentation to untrusted clients in production**.

## Outstanding

- [ ] Manual browser testing of Play/Pause/Step and visual node status changes.
- [ ] Integrate an explicit, authenticated local game ↔ editor transport in a future PR.
- [ ] Per-agent identifiers, remote live-selection and animation/camera correlation.
- [ ] Performance measurements on iPhone Safari with tracing disabled and enabled.
- [ ] Dependency security issue #6 must be resolved before public beta.
