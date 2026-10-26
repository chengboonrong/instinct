/**
 * Validate npm tarballs by installing them in a fresh directory outside the
 * monorepo. This never publishes packages to a registry.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const names = ['core', 'hsm', 'blackboard', 'definition', 'three', 'devtools', 'bridge'];
const output = path.join(root, 'artifacts', 'alpha-tarballs');
const consumer = mkdtempSync(path.join(tmpdir(), 'instinct-alpha-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(binary, args, cwd = root) {
  const result = spawnSync(binary, args, {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, npm_config_update_notifier: 'false'},
  });
  if (result.error || result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    throw new Error(binary + ' ' + args.join(' ') + ' failed: ' + (result.error?.message ?? result.status));
  }
  return result.stdout;
}
try {
  rmSync(output, {recursive: true, force: true});
  mkdirSync(output, {recursive: true});
  const tarballs = [];
  const allVersions = new Set();
  for (const name of names) {
    const workspace = '@instinct/' + name;
    const manifest = JSON.parse(readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'));
    assert.equal(manifest.name, workspace);
    assert.equal(manifest.private, true, 'Publishing is disabled before release approval');
    assert.equal(manifest.license, 'MIT');
    assert.equal(manifest.exports['.'].import, './dist/index.js');
    assert.equal(manifest.exports['.'].types, './dist/index.d.ts');
    allVersions.add(manifest.version);
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (dependency.startsWith('@instinct/')) {
        assert.equal(version, manifest.version, 'Internal package version mismatch: ' + workspace);
      }
    }
    const packed = JSON.parse(run(npm, [
      'pack', '--workspace=' + workspace, '--pack-destination=' + output,
      '--ignore-scripts', '--json',
    ]));
    assert.equal(packed.length, 1, workspace + ' should generate one archive');
    const result = packed[0];
    const entries = new Set(result.files.map(file => file.path));
    for (const required of ['package.json', 'LICENSE', 'README.md', 'dist/index.js', 'dist/index.d.ts']) {
      assert(entries.has(required), workspace + ' missing ' + required + ' from tarball');
    }
    assert(![...entries].some(file => file.startsWith('src/') || file.startsWith('test/')),
      workspace + ' leaked source/tests into runtime tarball');
    tarballs.push(path.join(output, result.filename));
  }
  assert.equal(allVersions.size, 1, 'All Instinct packages should use the same alpha version');
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'instinct-independent-consumer', private: true, type: 'module', version: '0.0.0',
  }, null, 2));
  console.log('Archives packed. Installing all seven packages outside the monorepo...');
  run(npm, [
    'install', '--no-save', '--no-package-lock', '--ignore-scripts', '--no-audit',
    '--no-fund', ...tarballs, 'three@0.175.0', '@types/three@0.175.0',
  ], consumer);
  for (const file of ['smoke.mjs', 'smoke.ts', 'tsconfig.json']) {
    copyFileSync(path.join(root, 'tests', 'consumer', file), path.join(consumer, file));
  }
  run(process.execPath, ['smoke.mjs'], consumer);
  run(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json',
  ], consumer);
  writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
    schema: 1, packageVersion: [...allVersions][0],
    packageCount: tarballs.length,
    packages: names.map((name, index) => ({name: '@instinct/' + name, filename: path.basename(tarballs[index])})),
    note: 'Experimental ESM tarballs; all 7 must be installed together. Nothing is published to npm.',
  }, null, 2) + '\n');
  console.log('Alpha package verification PASSED: Node imports, runtime behavior and consumer TypeScript declarations.');
} finally {
  rmSync(consumer, {recursive: true, force: true});
}
