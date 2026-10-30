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
- `start()` activates the controller, `send(event)` performs transitions and cancels displaced running behaviors, `update(dt)` senses, advances HSM and ticks the active BT, `stop()` cancels work, `dispose()` permanently shuts down the controller.
- For immediate cancel semantics, dispatch events through `ThreeAgent.send()` instead of invoking the HSM directly.
- Cancellation is immediate, except that a tree calling `send()` or `stop()` on its own NPC finishes its current tick first. `sense` may also call `stop()`.
- Do not call `stop()` from HSM callbacks: it throws during `send()` and `update()`, does nothing during `start()`, and the NPC keeps running.
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

## Scheduler membership and lifecycle guarantees (alpha hardening)

`AgentScheduler` tracks agent identity using a `Map` rather than scanning for duplicates on every registration. For crowd initialization this makes the duplicate check and removal O(1) on average rather than O(N).

- If an NPC creates or registers another agent during `update()`, the new agent becomes eligible **next scheduler tick**; it will not unexpectedly run halfway through the current frame.
- Removing an NPC within its own callback stops its remaining catch-up steps immediately. Removing another NPC before its turn skips that NPC for the frame.
- An old unregistration callback cannot delete a later registration using the same agent identity.
- Nested/re-entrant `scheduler.tick()` is rejected with an explicit error.
- A callback exception propagates; the scheduler returns to an unlocked state, so the owner may log/remove the failing NPC and continue on subsequent frames. An exception is **not** silently swallowed.
- Suspended-tab simulation time is still capped and discarded beyond the configured catch-up limits.

Use the unregistration callback on NPC despawn, before disposing of the associated Behavior Tree/controller. **Do not** mutate the underlying Map directly; the public `add()`, `tick()`, and `clear()` methods maintain these guarantees.

These changes are source/API compatible. Real iPhone Safari device memory and thermal validation remain blocked on physical measurements (Issue #12).
