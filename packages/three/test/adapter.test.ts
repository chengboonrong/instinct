import {describe, expect, it, vi} from 'vitest';
import {Group, Vector3} from 'three';
import {Action, Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {StateMachine, type MachineConfig} from '@instinct/hsm';
import {AgentScheduler, moveTowards, ThreeAgent, turnTowards} from '../src/index.js';

type Event = {type: 'SEE' | 'CLOSE' | 'LOST' | 'DIE'};
type Data = {health: number; target: Vector3 | null};
function npc() {
  const memory = new BlackboardStore<Data>({health: 100, target: null});
  const log: string[] = [];
  const config: MachineConfig<BlackboardStore<Data>, Event> = {
    initial: 'idle', states: {
      idle: {on: {SEE: 'combat.chase'}},
      combat: {initial: 'chase', on: {LOST: 'idle', DIE: 'dead'}, states: {
        chase: {on: {CLOSE: 'combat.attack'}}, attack: {},
      }},
      dead: {},
    },
  };
  const machine = new StateMachine(config, memory);
  const chase = new Agent(new Action<typeof memory>(() => {log.push('chase'); return 'running';}, () => log.push('abort chase')), memory);
  const attack = new Agent(new Action<typeof memory>(() => {log.push('attack'); return 'running';}, () => log.push('abort attack')), memory);
  const agent = new ThreeAgent({object: new Group(), blackboard: memory, machine, behaviors: {'combat.chase': chase, 'combat.attack': attack}});
  return {agent, memory, machine, log, chase};
}

describe('@instinct/three adapter', () => {
  it('moves on the local XZ plane without overshoot or changing Y', () => {
    const object = new Group(); object.position.set(0, 3, 0);
    const target = new Vector3(3, 20, 4);
    expect(moveTowards(object, target, {speed: 2, dt: 1})).toBe(false);
    expect(object.position.x).toBeCloseTo(1.2);
    expect(object.position.z).toBeCloseTo(1.6);
    expect(object.position.y).toBe(3);
    expect(moveTowards(object, target, {speed: 20, dt: 1})).toBe(true);
    expect(object.position.x).toBeCloseTo(3);
    expect(object.position.z).toBeCloseTo(4);
    expect(moveTowards(object, target, {speed: 0, dt: 1})).toBe(true);
  });

  it('rotates with bounded shortest-arc yaw', () => {
    const object = new Group();
    expect(turnTowards(object, new Vector3(1, 0, 0), Math.PI / 4, 1)).toBe(false);
    expect(object.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(turnTowards(object, new Vector3(1, 0, 0), Math.PI, 1)).toBe(true);
    expect(object.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(turnTowards(object, new Vector3(0, 0, 0), 0, 0)).toBe(true);
    expect(() => turnTowards(object, new Vector3(2, 0, 2), -1, 1)).toThrow(RangeError);
  });

  it('binds nested state trees and immediately aborts displaced behavior', () => {
    const {agent, log, machine} = npc();
    agent.start();
    agent.update(0.05);
    expect(log).toEqual([]);
    agent.send({type: 'SEE'});
    expect(machine.state).toBe('combat.chase');
    agent.update(0.05);
    expect(log).toEqual(['chase']);
    agent.send({type: 'CLOSE'});
    expect(log).toEqual(['chase', 'abort chase']);
    agent.update(0.05);
    expect(log.at(-1)).toBe('attack');
    agent.send({type: 'DIE'});
    expect(log.at(-1)).toBe('abort attack');
    expect(machine.state).toBe('dead');
    agent.stop();
    expect(machine.running).toBe(false);
  });

  it('falls back to ancestor state behavior and disposes idempotently', () => {
    const {memory, machine} = npc();
    const step = vi.fn(() => 'running' as const);
    const combat = new Agent(new Action<typeof memory>(step), memory);
    const controller = new ThreeAgent({object: new Group(), blackboard: memory, machine, behaviors: {combat}});
    controller.start();
    controller.send({type: 'SEE'});
    controller.update(1/30);
    controller.send({type: 'CLOSE'});
    controller.update(1/30);
    expect(step).toHaveBeenCalledTimes(2);
    controller.dispose();
    controller.dispose();
    expect(controller.running).toBe(false);
    expect(() => controller.start()).toThrow('disposed');
  });

  it('rejects mismatched stores and unbound state-specific behaviors', () => {
    const first = npc();
    const second = new BlackboardStore<Data>({health: 10, target: null});
    expect(() => new ThreeAgent({object: new Group(), blackboard: second, machine: first.machine})).toThrow('same BlackboardStore');
    expect(() => new ThreeAgent({object: new Group(), blackboard: second, behavior: first.chase})).toThrow('same BlackboardStore');
    expect(() => new ThreeAgent({object: new Group(), blackboard: first.memory, behaviors: {idle: first.chase}})).toThrow('require an HSM');
  });

  it('senses before state-machine update and behavior tick', () => {
    const {memory, machine, log} = npc();
    const sense = vi.fn((agent: ThreeAgent<Data, Event>) => {
      log.push('sense');
      if (agent.machine?.state === 'idle') agent.send({type: 'SEE'});
    });
    const action = new Agent(new Action<typeof memory>(() => {log.push('behavior'); return 'success';}), memory);
    const controller = new ThreeAgent({object: new Group(), blackboard: memory, machine, sense, behaviors: {'combat.chase': action}});
    controller.start();
    controller.update(0.05);
    expect(log).toEqual(['sense', 'behavior']);
    expect(sense).toHaveBeenCalledTimes(1);
  });
});

describe('AgentScheduler', () => {
  it('runs distinct NPCs at different fixed frequencies', () => {
    const scheduler = new AgentScheduler();
    const near = vi.fn();
    const far = vi.fn();
    const removeNear = scheduler.add({update: near}, {hz: 20});
    scheduler.add({update: far}, {hz: 5});
    for (let i = 0; i < 20; i++) scheduler.tick(0.05);
    expect(near).toHaveBeenCalledTimes(20);
    expect(far).toHaveBeenCalledTimes(5);
    expect(near).toHaveBeenCalledWith(0.05);
    removeNear();
    scheduler.tick(0.2);
    expect(near).toHaveBeenCalledTimes(20);
    expect(scheduler.size).toBe(1);
    scheduler.clear();
    expect(scheduler.size).toBe(0);
  });

  it('caps catch-up after tab suspension and reports dropped time', () => {
    const scheduler = new AgentScheduler();
    const calls = vi.fn();
    scheduler.add({update: calls}, {hz: 20, maxStepsPerFrame: 2, maxAccumulatedSeconds: 0.25});
    const stats = scheduler.tick(30);
    expect(stats.updates).toBe(2);
    expect(stats.discardedSeconds).toBeGreaterThan(29);
    expect(stats.agents).toBe(1);
    expect(calls).toHaveBeenCalledTimes(2);
    expect(scheduler.tick(0).updates).toBe(0);
    expect(() => scheduler.tick(-1)).toThrow(RangeError);
  });

  it('rejects invalid scheduling and duplicate agent registration', () => {
    const scheduler = new AgentScheduler();
    const actor = {update: vi.fn()};
    scheduler.add(actor);
    expect(() => scheduler.add(actor)).toThrow('already registered');
    expect(() => scheduler.add({update() {}}, {hz: 0})).toThrow(RangeError);
    expect(() => scheduler.add({update() {}}, {maxStepsPerFrame: 0})).toThrow(RangeError);
    expect(() => scheduler.add({update() {}}, {maxAccumulatedSeconds: -1})).toThrow(RangeError);
  });
});
