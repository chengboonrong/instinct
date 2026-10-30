import {describe, expect, it} from 'vitest';
import {Group} from 'three';
import {Action, Agent, Sequence} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {StateMachine, type MachineConfig} from '@instinct/hsm';
import {ThreeAgent} from '../src/index.js';

type Event = {type: 'GO' | 'BACK'};
type Data = {steps: number};
type Memory = BlackboardStore<Data>;

function rig(extra: Partial<MachineConfig<Memory, Event>> = {}) {
  const memory: Memory = new BlackboardStore<Data>({steps: 0});
  const config: MachineConfig<Memory, Event> = {
    initial: 'a', states: {a: {on: {GO: 'b'}}, b: {on: {BACK: 'a'}}}, ...extra,
  };
  return {memory, machine: new StateMachine(config, memory), log: [] as string[]};
}

describe('ThreeAgent calls made from its own callbacks', () => {
  it('restarts a tree from the top after it displaced itself mid-tick', () => {
    const {memory, machine, log} = rig();
    let npc!: ThreeAgent<Data, Event>;
    const tree = new Agent(new Sequence<Memory>([
      new Action(() => {log.push('first'); npc.send({type: 'GO'}); return 'success';}),
      new Action(() => {log.push('second'); return 'running';}, () => log.push('abort second')),
    ]), memory);
    npc = new ThreeAgent({object: new Group(), blackboard: memory, machine, behaviors: {a: tree}});
    npc.start();
    npc.update(0.05);
    expect(machine.state).toBe('b');
    npc.send({type: 'BACK'});
    log.length = 0;
    npc.update(0.05);
    expect(log[0]).toBe('first');
  });

  it('aborts an action that displaces its own tree and keeps running', () => {
    const {memory, machine, log} = rig();
    let npc!: ThreeAgent<Data, Event>;
    const tree = new Agent(new Action<Memory>(
      () => {npc.send({type: 'GO'}); return 'running';},
      () => log.push('abort'),
    ), memory);
    npc = new ThreeAgent({object: new Group(), blackboard: memory, machine, behaviors: {a: tree}});
    npc.start();
    npc.update(0.05);
    expect(log).toEqual(['abort']);
  });

  it('aborts an action that stops its own NPC', () => {
    const {memory, machine, log} = rig();
    let npc!: ThreeAgent<Data, Event>;
    const tree = new Agent(new Action<Memory>(
      () => {npc.stop(); return 'running';},
      () => log.push('abort'),
    ), memory);
    npc = new ThreeAgent({object: new Group(), blackboard: memory, machine, behaviors: {a: tree}});
    npc.start();
    npc.update(0.05);
    expect(log).toEqual(['abort']);
    expect(npc.running).toBe(false);
  });

  it('lets sense stop the NPC', () => {
    const {memory, machine} = rig();
    const npc = new ThreeAgent({object: new Group(), blackboard: memory, machine, sense: agent => agent.stop()});
    npc.start();
    npc.update(0.05);
    expect(npc.running).toBe(false);
    expect(machine.running).toBe(false);
  });

  it('keeps running when stop is rejected from an HSM callback', () => {
    let npc!: ThreeAgent<Data, Event>;
    const {memory, machine, log} = rig({states: {
      a: {on: {GO: 'b'}},
      b: {enter: () => npc.stop()},
    }});
    const tree = new Agent(new Action<Memory>(() => 'running', () => log.push('abort')), memory);
    npc = new ThreeAgent({object: new Group(), blackboard: memory, machine, behavior: tree});
    npc.start();
    npc.update(0.05);
    expect(() => npc.send({type: 'GO'})).toThrow('Cannot stop during state-machine callbacks');
    expect(npc.running).toBe(true);
    expect(machine.running).toBe(true);
    expect(log).toEqual([]);
  });

  it('ends fully stopped when an abort handler throws', () => {
    const {memory, machine} = rig();
    const tree = new Agent(new Action<Memory>(() => 'running', () => {throw new Error('abort failed');}), memory);
    const npc = new ThreeAgent({object: new Group(), blackboard: memory, machine, behavior: tree});
    npc.start();
    npc.update(0.05);
    expect(() => npc.stop()).toThrow('abort failed');
    expect(npc.running).toBe(false);
    expect(machine.running).toBe(false);
    npc.update(0.05);
  });
});
