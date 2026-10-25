# Instinct

**Give every character an instinct.**

A lightweight, engine-independent behavior-tree runtime written in TypeScript, with a Three.js example. Inspired by the architecture and authoring experience of LimboAI, but not a port of its Godot code.

> Experimental v0.1.0 source prototype. Not yet published to npm. Public API and runtime semantics can change.

## What's included

- Action and Condition nodes
- Memory Sequence and Selector
- Reactive priority Selector with branch interruption
- Inverter decorator
- Per-agent blackboard and timestep validation
- Experimental hierarchical state machines (`@instinct/hsm`) with guarded transitions and event queues
- Typed scoped Blackboards (`@instinct/blackboard`) with parent inheritance and change subscriptions
- Three.js adapter (`@instinct/three`) with scene-object binding, state-matched behaviors and bounded fixed-rate AI scheduling
- Versioned graph definitions and runtime compiler (`@instinct/definition`)
- Browser-based React Flow Behavior Studio (`apps/editor`): node graph, inspector, child priority, validation, JSON import/export and behavior preview
- Three.js patrol guard and interactive combat NPC demos
- Vitest tests and GitHub Actions CI

## Local development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev --workspace=@instinct/editor
npm run dev --workspace=@instinct/example-three
npm run dev --workspace=@instinct/example-combat
```

## Design direction

Keep the runtime independent of rendering and React. The editor is an authoring tool, not a game bundle dependency. Build runtime inspection, reusable graph serialization and production performance validation incrementally. Prioritize safe cancellation, reproducible tests and small mobile runtime overhead.

## License

MIT.

Read [Visual Editor Guide](docs/editor.md), [HSM guide](docs/state-machines.md), [Blackboard guide](docs/blackboards.md), and [Three.js guide](docs/three.md).
