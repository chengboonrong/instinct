import assert from 'node:assert/strict';
import {Group} from 'three';
import {Action, Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {StateMachine} from '@instinct/hsm';
import {compileGraph, sampleGraph} from '@instinct/definition';
import {TraceRecorder} from '@instinct/devtools';
import {ThreeAgent, AgentScheduler} from '@instinct/three';
import {DevtoolsViewer, validateRemoteFrame} from '@instinct/bridge';

const memory = new BlackboardStore({health: 100, hasTarget: false});
const trace = new TraceRecorder({capacity: 32});
trace.watchBlackboard(memory);
const graph = sampleGraph();
const registry = {
  conditions: {
    lowHealth: ({blackboard}) => blackboard.get('health') < 30,
    hasTarget: ({blackboard}) => blackboard.get('hasTarget'),
  },
  actions: {
    patrol: () => 'running',
    attack: () => 'running',
    retreat: () => 'running',
  },
};
const npc = new Agent(compileGraph(graph, registry, {observer: trace}), memory);
trace.beginTick();
assert.equal(npc.tick(0.05), 'running');
assert.equal(trace.snapshot().nodeStatuses.patrol, 'running');
memory.set('hasTarget', true);
trace.beginTick();
npc.tick(0.05);
assert.equal(trace.snapshot().nodeStatuses.attack, 'running');

const machine = new StateMachine({
  initial: 'idle',
  states: {idle: {on: {GO: 'combat'}}, combat: {}},
}, memory);
machine.start();
machine.send({type: 'GO'});
assert.equal(machine.state, 'combat');

const controllerTree = new Agent(new Action(() => 'running'), memory);
const controller = new ThreeAgent({
  object: new Group(), blackboard: memory, behavior: controllerTree,
});
controller.start();
const scheduler = new AgentScheduler();
scheduler.add(controller, {hz: 20});
assert.equal(scheduler.tick(0.05).updates, 1);
controller.dispose();
scheduler.clear();

assert.equal(validateRemoteFrame({
  id: 'test-npc', label: 'Consumer NPC', graph, trace: trace.snapshot(),
}), true);
new DevtoolsViewer({token: 'local-development-token-123456'});
trace.dispose();
console.log('External consumer smoke test passed.');
