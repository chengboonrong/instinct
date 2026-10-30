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
- A minimal Three.js patrol guard demonstration
- Vitest tests and GitHub Actions CI

## Local development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev --workspace=@instinct/example-three
```

## Design direction

Keep the runtime independent of rendering. Build a future Three.js adapter, typed/scoped blackboards, reusable JSON-authored trees, visual editor, and live debugging as separate packages. Prioritize deterministic behavior and safe cancellation.

## License

MIT. Open source, contributions welcome after APIs stabilize.

See [HSM guide](docs/state-machines.md) for hierarchical state-machine semantics and an example.
