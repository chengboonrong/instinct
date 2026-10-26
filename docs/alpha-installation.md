# Installable Instinct alpha — validation only

Instinct's seven runtime packages are **not published to npm** and are not approved for production use. This branch prepares versioned `.tgz` files for testing real package boundaries.

## Find CI archives

1. Open the latest successful GitHub Actions run for [PR #14](https://github.com/chengboonrong/instinct/pull/14).
2. Download the `instinct-alpha-packages` workflow artifact and unzip it.
3. The artifact should include seven `.tgz` archives plus `manifest.json`. Each archive contains its own MIT license, README, compiled ESM and TypeScript declarations. Source/test files are excluded.

In a **separate test project** outside the Instinct monorepo, install all seven tarballs together:

```sh
npm init -y
npm install --save-exact ./instinct-*.tgz three@0.175.0
npm install -D @types/three@0.175.0
```

The installed package entry points can then be used with normal imports:

```ts
import {Agent, Action} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {ThreeAgent} from '@instinct/three';
import {Group} from 'three';

const memory = new BlackboardStore({health: 100});
const agent = new Agent(new Action<typeof memory>(() => 'running'), memory);
const npc = new ThreeAgent({object: new Group(), blackboard: memory, behavior: agent});
npc.start();
npc.update(1 / 20);
npc.dispose();
```

The `@instinct/three` package requires a compatible Three.js peer and its TypeScript declarations require `@types/three`. `@instinct/bridge` must only be used for development on loopback with a locally generated token.

### Run the packaging contract check

```sh
npm ci
npm run build
npm run verify:packages
```

The last command packages all seven workspaces, verifies archive contents, creates an isolated temporary consumer directory, installs every tarball via npm, runs a Node ESM behavior/blackboard/Three.js/bridge smoke test and compiles a TypeScript consumer fixture. CI runs this too and uploads the exact audited packages. No npm publication, npm account access, Github release or package registry operation is involved.

## Before any registry release

- [ ] Confirm ownership of the **`@instinct` npm scope** or choose an alternative org/scope. A GitHub repository named Instinct does not grant npm scope ownership.
- [ ] Decide on alpha prerelease names and update package versions/dependency ranges consistently.
- [ ] Review API semantics, test result reproducibility and package licenses.
- [ ] Merge stacked PRs in order (all currently drafts); verify `main` after merge.
- [ ] Complete the physical-device testing in [Issue #12](https://github.com/chengboonrong/instinct/issues/12).
- [ ] Perform an explicit security and publication review before removing each package's `private: true` flag.

Passing npm pack, smoke tests and GitHub Actions does **not** imply the packages are published or device-certified.
