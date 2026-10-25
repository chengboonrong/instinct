# Instinct Behavior Studio (PR #5, experimental)

The **visual editor is a developer application**, not a runtime dependency. Its React and React Flow packages are kept under `apps/editor/`. `@instinct/definition` is a small **engine-independent** serializer/validator/compiler whose output is consumable by the existing `@instinct/core` runtime.

## Start the editor

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev --workspace=@instinct/editor
```

Open the Vite localhost URL. Use the node library to add Behavior Tree nodes, drag handles to connect them, select nodes in the inspector, and reorder children with ↑ / ↓ to set execution priority. Export creates portable v1 JSON (also copies to clipboard when permissions allow); paste/edit the JSON in the right panel and import it back. The simple sandbox runs discrete 50ms AI ticks against an editable health/target state.

### Supported nodes

- `sequence` — memory sequence
- `selector` — memory selector
- `reactiveSelector` — higher-priority branches reevaluated every tick
- `inverter` — unary decorator
- `action` — named runtime action registry reference
- `condition` — named runtime condition registry reference

Children are stored as an **ordered ID array**. The visual canvas's x/y position does **not** control priority. Conditions/actions are looked up by stable **task keys**, not serialized functions or executable code. Undefined task keys are rejected by the compiler. The editor's sandbox knows only `lowHealth`, `hasTarget`, `retreat`, `attack`, and `patrol`; projects should provide their own registry to the compiler.

### Runtime example

```ts
import {Agent} from '@instinct/core';
import {compileGraph, parseGraph, type BehaviorRegistry} from '@instinct/definition';

type Memory = {target: string | null};
const registry: BehaviorRegistry<Memory> = {
  conditions: {hasTarget: ({blackboard}) => blackboard.target !== null},
  actions: {attack: () => 'running', patrol: () => 'running'},
};
const graph = parseGraph(exportedGraphJson);
const npc = new Agent(compileGraph(graph, registry), {target: 'player'});
npc.tick(1 / 20);
```

**Compile a fresh tree per NPC.** Shared graph definitions are safe; instantiated Behavior Tree nodes contain mutable execution state and must not be reused across agents.

## Validation and limitations

- Versioned JSON with `version: 1`, `rootId`, and nodes with kind, ID, label, task key, child priority order, and editor coordinates.
- Rejects duplicate IDs, invalid references, missing root, cycles, multi-parent nodes, invalid arity, orphan nodes, oversized graphs, and malformed JSON. An unconnected node is temporarily invalid during editing and cannot be exported.
- Explicit max 256 nodes per graph, max 128 KB on import, no remote network loading or eval.
- Experimental editing experience: no undo/redo, nested HSM graph authoring, debugger telemetry, tree templates, graph migrations, shared subtree libraries, or hot-swapping into live game sessions yet.
- This does not integrate into KL Rush and does not validate production iPhone Safari performance.
