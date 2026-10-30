# Typed scoped Blackboards (experimental)

`@instinct/blackboard` stores game AI values shared between Behavior Trees and Hierarchical State Machines. The store is engine-independent; Three.js objects, references and navigation agents can live in the data shape without pulling Three.js into the core library.

```ts
import {BlackboardStore} from '@instinct/blackboard';

const world = new BlackboardStore({
  health: 100,
  target: null as string | null,
  alert: false,
});
const squad = world.fork();
const guard = squad.fork({health: 75});

world.set('alert', true);
guard.get('alert');       // true, inherited through squad
guard.get('health');      // 75, local override
world.get('health');      // 100, unaffected

guard.clearOverride('health');
guard.get('health');      // 100, inherited again
```

## Integration

`Agent` now accepts any typed object as its blackboard (the original `Record<string, unknown>` API still works). Pass a `BlackboardStore<T>` directly into both an `@instinct/core` Agent and an `@instinct/hsm` StateMachine to give both the same typed data access.

```ts
import {Agent, Action} from '@instinct/core';
import {StateMachine} from '@instinct/hsm';

const guardMemory = world.fork();
const tree = new Agent(new Action<typeof guardMemory>(ctx => {
  ctx.blackboard.set('health', ctx.blackboard.get('health') - 1);
  return 'success';
}), guardMemory);

// Use the same guardMemory as StateMachine's context and in its callbacks.
const machine = new StateMachine({
  initial: 'idle',
  states: {idle: {on: {HURT: {action: data => data.set('alert', true)}}}},
}, guardMemory);
machine.start();
tree.tick(1 / 60);
machine.send({type: 'HURT'});
```

## Scope and notification semantics

- `fork(overrides?)` creates a child; `get` resolves the nearest local key, otherwise consults the parent chain.
- `set(key, value)` **always writes to the current scope**. It does not mutate an ancestor or sibling.
- `clearOverride(key)` deletes the local shadow and restores inherited visibility. It throws on root stores.
- `subscribe(fn)` emits `{key, previous, current, origin}` when a *visible* value changes, including unshadowed parent changes. Unsubscribe when UI/debug inspection ends; parent subscriptions are lazy.
- Setting a value equal to its current value does not emit a notification, even though the key becomes locally shadowed.
- `snapshot()` returns a **shallow copy** of visible values. Object references are not cloned. For reliable notifications, treat stored values as immutable and replace them through `set()`.
- TypeScript enforces key/value types at compile time; this package does **not** perform schema or JSON validation at runtime. Editor serialization, migration and value codecs are future work.
- Prefer one shared world store and **separate per-NPC child stores** to avoid cross-agent execution state leaks.
