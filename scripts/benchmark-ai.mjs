import {performance} from 'node:perf_hooks';
import {Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {compileGraph, sampleGraph} from '@instinct/definition';
import {AgentScheduler} from '@instinct/three';

/**
 * Repeatable synthetic CPU benchmark for Instinct's game-AI update scheduler.
 * This is NOT a browser/phone GPU test. Results depend on the host CPU and Node.
 */
function numericOption(prefix, fallback, min, max) {
  const found = process.argv.find(value => value.startsWith('--' + prefix + '='));
  if (!found) return fallback;
  const raw = found.slice(prefix.length + 3);
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RangeError('--' + prefix + ' must be an integer from ' + min + ' to ' + max);
  }
  return number;
}
const frames = numericOption('frames', 1200, 60, 10000);
const counts = (process.argv.find(v => v.startsWith('--agents='))?.slice(9) ?? '50,250')
  .split(',').map(value => Number(value));
if (!counts.length || counts.some(x => !Number.isSafeInteger(x) || x < 1 || x > 2000)) {
  throw new RangeError('--agents must list integers from 1 to 2000');
}
const graph = sampleGraph();
const registry = {
  conditions: {
    lowHealth: ({blackboard}) => blackboard.get('health') < 30,
    hasTarget: ({blackboard}) => blackboard.get('hasTarget'),
  },
  actions: {
    patrol: ({blackboard}) => {blackboard.set('steps', blackboard.get('steps') + 1); return 'running';},
    attack: ({blackboard}) => {blackboard.set('steps', blackboard.get('steps') + 2); return 'running';},
    retreat: ({blackboard}) => {blackboard.set('steps', blackboard.get('steps') + 1); return 'running';},
  },
};
function measure(agentCount) {
  const scheduler = new AgentScheduler();
  const memories = [];
  let updates = 0;
  for (let index = 0; index < agentCount; index++) {
    const board = new BlackboardStore({health: 100, hasTarget: false, steps: 0});
    memories.push(board);
    const agent = new Agent(compileGraph(graph, registry), board);
    scheduler.add({update(delta) {
      updates++;
      // Simulate deterministic detection and health changes across agents.
      const target = (updates + index) % 17 < 9;
      board.set('hasTarget', target);
      if ((updates + index) % 157 === 0) board.set('health', 20);
      if ((updates + index) % 311 === 0) board.set('health', 100);
      agent.tick(delta);
    }}, {hz: index % 5 === 0 ? 5 : 20, maxStepsPerFrame: 2, maxAccumulatedSeconds: 0.25});
  }
  const dt = 1 / 60;
  for (let frame = 0; frame < 180; frame++) scheduler.tick(dt);
  const samples = [];
  let discarded = 0;
  let executed = 0;
  for (let frame = 0; frame < frames; frame++) {
    const begin = performance.now();
    const stats = scheduler.tick(dt);
    samples.push(performance.now() - begin);
    discarded += stats.discardedSeconds;
    executed += stats.updates;
  }
  samples.sort((a, b) => a - b);
  const pick = percent => samples[Math.min(samples.length - 1, Math.floor(samples.length * percent))];
  const beforeBurst = updates;
  const burst = scheduler.tick(5); // game returns from a background tab
  if (burst.updates > agentCount * 2 || updates - beforeBurst !== burst.updates || burst.discardedSeconds <= 0) {
    throw new Error('Scheduler catch-up policy violated');
  }
  const total = samples.reduce((a, b) => a + b, 0);
  const observedSteps = memories.reduce((sum, board) => sum + board.get('steps'), 0);
  scheduler.clear();
  return {
    agents: agentCount, frames, nearAgentHz: 20, farAgentHz: 5,
    warmupFrames: 180, samplesMs: {
      average: Number((total / samples.length).toFixed(4)),
      p50: Number(pick(0.50).toFixed(4)),
      p95: Number(pick(0.95).toFixed(4)),
      p99: Number(pick(0.99).toFixed(4)),
      max: Number(samples.at(-1).toFixed(4)),
    },
    aiUpdates: executed, behaviorSteps: observedSteps,
    simulationSecondsDroppedDuringSteadyFrames: Number(discarded.toFixed(5)),
    burst: {aiUpdates: burst.updates, discardedSeconds: Number(burst.discardedSeconds.toFixed(5))},
  };
}
const measurements = counts.map(measure);
const report = {
  version: 1,
  environment: {node: process.version, platform: process.platform, architecture: process.arch},
  warning: 'Synthetic Node CPU benchmark, not a mobile Safari or GPU performance guarantee.',
  measurements,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
