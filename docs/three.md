# Three.js Adapter (experimental)

`@instinct/three` integrates the engine-independent `@instinct/core`, `@instinct/hsm`, and `@instinct/blackboard` packages with Three.js. It does **not** create a renderer, browser event loop, physics body, or navigation mesh.

## Run the interactive demo

```sh
npm install
npm run typecheck
npm run dev --workspace=@instinct/example-combat
```

Move the blue player with WASD / arrow keys and press F near the enemy. The red NPC patrols, detects, chases, attacks, disengages and dies. The geometry is placeholder art, not KL Rush content.

## Controller lifecycle

- `ThreeAgent` binds `THREE.Object3D`, one `BlackboardStore`, an optional HSM and Behavior Tree Agents.
- A map such as `behaviors: {'combat.chase': chaseTree, combat: combatFallback}` selects the most specific matching state path.
- All HSMs and trees must reference exactly the same per-agent store; constructor validates identity.
- `start()` activates the controller, `send(event)` performs transitions and immediately cancels displaced running behaviors, `update(dt)` senses, advances HSM and ticks the active BT, `stop()` cancels work, `dispose()` permanently shuts down the controller.
- For immediate cancel semantics, dispatch events through `ThreeAgent.send()` instead of invoking the HSM directly.
- Each NPC needs independent tree *instances*. Reuse definitions, not the stateful node instances.

## Movement helpers

`moveTowards()` and `turnTowards()` use **local X/Z coordinates** and local +Z as forward. There is no collision avoidance, navmesh routing, platform transforms or physics integration. Plug in YUKA, Recast, or existing KL Rush movement systems before production use.

## Bounded scheduler

```ts
const scheduler = new AgentScheduler();
const remove = scheduler.add(npc, {hz: 20, maxStepsPerFrame: 2});
function updateFrame(realDelta: number) {
  scheduler.tick(realDelta);
}
// Upon NPC despawn:
remove();
npc.dispose();
```

The scheduler runs agent updates at fixed `1/hz` intervals independent of WebGL rendering. Backlogs are capped after tab suspension; extra simulation time is dropped rather than causing an unbounded burst of work. `SchedulerStats` is **not a CPU budget measurement**; measure timings separately. For iPhone Safari, investigate 20 Hz active agents / 5 Hz distant agents as initial hypotheses only; neither is a verified device performance threshold.

Deferred: pathfinding, raycast perception, server-authoritative combat, editor serialization, deterministic rollback, pooling, instrumentation, and on-device benchmarks.
