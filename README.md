# Instinct

**Give every character an instinct.**

Engine-independent game AI building blocks (Behavior Trees, hierarchical state machines, typed blackboards) plus opt-in Three.js tooling and a visual editor. Inspired by LimboAI's authoring workflow, but no Godot-specific runtime code is ported.

> Experimental v0.1.0-alpha. API unstable, not published to npm. All feature PRs are stacked drafts awaiting manual review.

## Packages

- `@instinct/core`: memory and reactive Behavior Tree runtime
- `@instinct/hsm`: hierarchical state-machine runtime
- `@instinct/blackboard`: typed scoped memory and notifications
- `@instinct/definition`: JSON graph schema, validation and compilation
- `@instinct/three`: Three.js controller and bounded fixed-step scheduler
- `@instinct/devtools`: opt-in node execution tracing and Blackboard inspection
- `@instinct/bridge`: dev-only local WebSocket publisher and read-only Studio viewer

## Examples and tools

- `apps/editor` — React Flow Behavior Studio with local preview and live game inspector
- `apps/bridge` — loopback-only token-protected development relay
- `examples/three-basic` — basic patrol guard
- `examples/three-combat` — basic combat NPC
- `examples/three-remote` — two live traced NPCs, selectable in Studio

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev --workspace=@instinct/editor
```

To run the game/editor integration, see [Local Game Bridge](docs/bridge.md). No production/debug server is started by default.

## Security and maturity

`@instinct/bridge` is a **local development tool**; never expose its WebSocket relay to the public internet. Debug traces can disclose Blackboard values. Dependencies still require security review (issue #6). Manual browser testing, build reproducibility and mobile performance gates remain outstanding.

## License

MIT.

See [Visual Editor](docs/editor.md), [Runtime Debugger](docs/debugging.md), [Bridge](docs/bridge.md), [HSM](docs/state-machines.md), [Blackboard](docs/blackboards.md) and [Three.js](docs/three.md) guides.
