import {Group} from 'three';
import {Action, Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {ThreeAgent} from '@instinct/three';
import {compileGraph, type BehaviorRegistry, sampleGraph} from '@instinct/definition';

const memory = new BlackboardStore({health: 100, hasTarget: false});
const registry: BehaviorRegistry<typeof memory> = {
  conditions: {
    lowHealth: ({blackboard}) => blackboard.get('health') < 30,
    hasTarget: ({blackboard}) => blackboard.get('hasTarget'),
  },
  actions: {patrol: () => 'running', attack: () => 'running', retreat: () => 'running'},
};
const tree = new Agent(compileGraph(sampleGraph(), registry), memory);
tree.tick(0.05);
const fallback = new Agent(new Action<typeof memory>(() => 'running'), memory);
const controller = new ThreeAgent({object: new Group(), blackboard: memory, behavior: fallback});
controller.start();
controller.update(0.05);
controller.dispose();
