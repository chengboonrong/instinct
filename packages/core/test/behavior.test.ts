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
  it('rejects invalid timestep', () => {
    expect(() => new Agent(new Action(() => 'success'), {}).tick(-1)).toThrow(RangeError);
  });
});
