import {describe, expect, it, vi} from 'vitest';
import {Action, Agent, Condition, ReactiveSelector, Selector, Sequence} from '../src/index.js';

describe('Instinct behavior tree', () => {
  it('resumes running sequence children', () => {
    const order: string[] = [];
    let count = 0;
    const root = new Sequence([
      new Action(() => { order.push('a'); return 'success'; }),
      new Action(() => { order.push('b'); return ++count === 1 ? 'running' : 'success'; })
    ]);
    const agent = new Agent(root, {});
    expect(agent.tick(0.016)).toBe('running');
    expect(agent.tick(0.016)).toBe('success');
    expect(order).toEqual(['a', 'b', 'b']);
  });
  it('falls through on selector failure', () => {
    const agent = new Agent(new Selector([new Condition(() => false), new Action(() => 'success')]), {});
    expect(agent.tick(0)).toBe('success');
  });
  it('aborts a displaced lower-priority action', () => {
    const abort = vi.fn();
    const blackboard = {danger: false};
    const root = new ReactiveSelector([
      new Sequence([new Condition<typeof blackboard>(ctx => ctx.blackboard.danger), new Action(() => 'success')]),
      new Action<typeof blackboard>(() => 'running', abort)
    ]);
    const agent = new Agent(root, blackboard);
    expect(agent.tick(0.01)).toBe('running');
    blackboard.danger = true;
    expect(agent.tick(0.01)).toBe('success');
    expect(abort).toHaveBeenCalledTimes(1);
  });
  it('aborts running work once on stop', () => {
    const abort = vi.fn();
    const agent = new Agent(new Sequence([new Action(() => 'running', abort)]), {});
    agent.tick(0);
    agent.stop();
    agent.stop();
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('restarts a sequence from the first child after a failure', () => {
    const order: string[] = [];
    let attempt = 0;
    const agent = new Agent(new Sequence([
      new Action(() => { order.push('a'); return 'success'; }),
      new Action(() => { order.push('b'); return ++attempt === 1 ? 'failure' : 'success'; }),
    ]), {});
    expect(agent.tick(0)).toBe('failure');
    expect(agent.tick(0)).toBe('success');
    expect(order).toEqual(['a', 'b', 'a', 'b']);
  });

  it('resumes a memory selector without reevaluating failed branches', () => {
    const first = vi.fn(() => 'failure' as const);
    const agent = new Agent(new Selector([new Action(first), new Action(() => 'running')]), {});
    agent.tick(0);
    agent.tick(0);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('falls through when the active reactive branch fails', () => {
    let healthy = true;
    const fallback = vi.fn(() => 'running' as const);
    const abort = vi.fn();
    const agent = new Agent(new ReactiveSelector([
      new Action(() => healthy ? 'running' : 'failure', abort),
      new Action(fallback),
    ]), {});
    agent.tick(0);
    healthy = false;
    expect(agent.tick(0)).toBe('running');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
  });

  it('defers stop requested inside its own tick and rejects recursive ticks', () => {
    const order: string[] = [];
    const agent: Agent = new Agent(new Sequence([
      new Action(() => { agent.stop(); order.push('stop requested'); return 'success'; }),
      new Action(() => { order.push('finished tick'); return 'running'; }, () => order.push('aborted')),
    ]), {});
    agent.tick(0);
    expect(order).toEqual(['stop requested', 'finished tick', 'aborted']);
    const nested: Agent = new Agent(new Action(() => nested.tick(0)), {});
    expect(() => nested.tick(0)).toThrow('recursively');
  });

  it('rejects invalid timestep', () => {
    expect(() => new Agent(new Action(() => 'success'), {}).tick(-1)).toThrow(RangeError);
  });
});
