import {describe, expect, it, vi} from 'vitest';
import {Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {compileGraph, sampleGraph, type BehaviorGraph, type BehaviorRegistry} from '@instinct/definition';
import {TraceRecorder, previewValue} from '../src/index.js';

type Data = {health: number; target: boolean};
const registry: BehaviorRegistry<BlackboardStore<Data>> = {
  conditions: {
    lowHealth: ({blackboard}) => blackboard.get('health') < 30,
    hasTarget: ({blackboard}) => blackboard.get('target'),
  },
  actions: {
    patrol: () => 'running',
    attack: () => 'running',
    retreat: () => 'running',
  },
};
const setup = (capacity = 256) => {
  const blackboard = new BlackboardStore<Data>({health: 100, target: false});
  const recorder = new TraceRecorder({capacity});
  recorder.watchBlackboard(blackboard);
  const agent = new Agent(compileGraph(sampleGraph(), registry, {observer: recorder}), blackboard);
  return {blackboard, recorder, agent};
};

describe('TraceRecorder', () => {
  it('records executed node statuses and correctly highlights reactive interruption', () => {
    const {blackboard, recorder, agent} = setup();
    recorder.beginTick();
    expect(agent.tick(0.05)).toBe('running');
    const first = recorder.snapshot();
    expect(first.nodeStatuses.patrol).toBe('running');
    expect(first.nodeStatuses.hasTarget).toBe('failure');
    expect(first.nodeStatuses.attack).toBeUndefined();
    blackboard.set('target', true);
    recorder.beginTick();
    agent.tick(0.05);
    const second = recorder.snapshot();
    expect(second.nodeStatuses.patrol).toBe('aborted');
    expect(second.nodeStatuses.attack).toBe('running');
    expect(second.entries.some(e => e.kind === 'node' && e.nodeId === 'patrol' && e.status === 'aborted')).toBe(true);
    blackboard.set('health', 12);
    recorder.beginTick();
    agent.tick(0.05);
    expect(recorder.snapshot().nodeStatuses.retreat).toBe('running');
    expect(recorder.snapshot().nodeStatuses.attack).toBe('aborted');
  });

  it('records Blackboard changes without retaining object references', () => {
    const board = new BlackboardStore({name: 'enemy', count: 0, payload: {x: 3}});
    const recorder = new TraceRecorder();
    const stop = recorder.watchBlackboard(board);
    board.set('count', 1);
    board.set('payload', {x: 5});
    expect(recorder.snapshot().blackboard).toMatchObject({name: 'enemy', count: '1', payload: '[object]'});
    const changes = recorder.snapshot().entries.filter(e => e.kind === 'blackboard');
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({key: 'count', origin: 'local', previous: '0', current: '1'});
    stop();
    board.set('count', 2);
    expect(recorder.snapshot().entries).toHaveLength(2);
  });

  it('records inherited changes through a child scope only while subscribed', () => {
    const world = new BlackboardStore({alert: false});
    const guard = world.fork();
    const recorder = new TraceRecorder();
    recorder.watchBlackboard(guard);
    world.set('alert', true);
    expect(recorder.snapshot().entries[0]).toMatchObject({key: 'alert', origin: 'inherited'});
    guard.set('alert', false);
    world.set('alert', false);
    expect(recorder.snapshot().entries).toHaveLength(2);
    recorder.dispose();
    world.set('alert', true);
    expect(recorder.snapshot().entries).toHaveLength(0);
  });

  it('caps trace length and returns detached snapshots', () => {
    const recorder = new TraceRecorder({capacity: 2});
    recorder.beginTick();
    recorder.onNodeEvent({nodeId: 'a', type: 'tick', status: 'failure'});
    recorder.onNodeEvent({nodeId: 'b', type: 'tick', status: 'success'});
    recorder.onNodeEvent({nodeId: 'c', type: 'tick', status: 'running'});
    const one = recorder.snapshot();
    expect(one.entries).toHaveLength(2);
    expect(one.entries[0]?.sequence).toBe(2);
    const mutable = one.nodeStatuses as Record<string, string>;
    mutable.b = 'altered';
    expect(recorder.snapshot().nodeStatuses.b).toBe('success');
    recorder.beginTick();
    expect(recorder.snapshot().nodeStatuses).toEqual({});
    expect(recorder.snapshot().entries).toHaveLength(2);
  });

  it('works without an observer and preserves behavior', () => {
    const board = new BlackboardStore<Data>({health: 100, target: true});
    const agent = new Agent(compileGraph(sampleGraph(), registry), board);
    expect(agent.tick(0.05)).toBe('running');
    agent.stop();
    expect(agent.tick(0.05)).toBe('running');
  });

  it('records a manually aborted action from the outside', () => {
    const recorder = new TraceRecorder();
    const abort = vi.fn();
    const graph: BehaviorGraph = {version: 1, rootId: 'a', nodes: [
      {id: 'a', kind: 'action', label: 'a', task: 'a', children: [], position: {x: 0, y: 0}},
    ]};
    const memory = {value: 0};
    const agent = new Agent(compileGraph(graph, {
      conditions: {}, actions: {a: {run: () => 'running', onAbort: abort}},
    }, {observer: recorder}), memory);
    recorder.beginTick();
    agent.tick(0.1);
    agent.stop();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(recorder.snapshot().nodeStatuses.a).toBe('aborted');
  });

  it('limits configuration and safely formats complex memory', () => {
    expect(() => new TraceRecorder({capacity: 0})).toThrow(RangeError);
    expect(() => new TraceRecorder({capacity: 8193})).toThrow(RangeError);
    expect(previewValue('A'.repeat(100)).length).toBeLessThan(100);
    expect(previewValue(Symbol('x'))).toBe('[symbol]');
    expect(previewValue([1, 2])).toBe('[array: 2]');
    expect(previewValue(null)).toBe('null');
    const recorder = new TraceRecorder();
    recorder.dispose();
    recorder.dispose();
    expect(() => recorder.beginTick()).toThrow('disposed');
  });
});
