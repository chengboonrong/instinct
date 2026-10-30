# Hierarchical State Machines (experimental)

`@instinct/hsm` provides a rendering-independent hierarchical finite-state machine for game characters. It does not depend on Three.js and can be shared between client and server when simulation code is compatible.

```ts
import {StateMachine, type MachineConfig} from '@instinct/hsm';

type EnemyEvent = {type: 'SPOTTED' | 'LOST' | 'HURT'};
type EnemyData = {health: number};
const config: MachineConfig<EnemyData, EnemyEvent> = {
  initial: 'patrol',
  states: {
    patrol: {on: {SPOTTED: 'combat.chase'}},
    combat: {
      initial: 'chase',
      on: {LOST: 'patrol'},
      states: {
        chase: {on: {HURT: [{target: 'combat.retreat', guard: data => data.health < 30}]}},
        retreat: {},
      },
    },
  },
};

const enemy = new StateMachine(config, {health: 100});
enemy.start();
enemy.send({type: 'SPOTTED'});
console.log(enemy.state); // combat.chase
enemy.update(1 / 60);
```

## Semantics

- `start()` enters the initial nested leaf. `stop()` exits the active states and clears queued events.
- `send(event)` processes event handlers from **leaf to root**, using the first guard that passes. If a candidate fails its guard, other candidates and parent handlers may handle the event.
- Transitions use **absolute dotted target paths** from the machine root. An explicit transition to the active leaf exits and re-enters that leaf. A targetless transition only executes its action.
- For transitions between sibling leaves, the shared ancestor stays active, so its `exit` and `enter` callbacks are not invoked.
- `update(dt)` invokes active `update` handlers parent-first. `dt` must be finite and nonnegative.
- Events sent by lifecycle, action, or update callbacks are **queued** to run after the current callback. The configurable event-drain limit protects against runaway loops.
- Machine configuration can be reused, but each NPC needs its **own StateMachine instance and context**.
- Callbacks are synchronous. `start`, `stop`, and `update` must not be called recursively. Exceptions inside user callbacks propagate; transitions are **not transactional**. State correctness following a throwing action/callback is not guaranteed, so callers should treat such exceptions as fatal to the agent until reset.

## Integration plan

An HSM describes coarse states (`patrol`, `combat`, `dead`). State lifecycle hooks will later start/stop Instinct behavior trees for those states. Navigation and rendering are adapter responsibilities, not HSM responsibilities.
