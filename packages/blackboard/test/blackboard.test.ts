import {describe, expect, it, vi} from 'vitest';
import {BlackboardStore} from '../src/index.js';

interface EnemyData {
  health: number;
  target: string | null;
  alert: boolean;
}
const defaults = (): EnemyData => ({health: 100, target: null, alert: false});

describe('BlackboardStore', () => {
  it('reads typed root data and writes a value', () => {
    const board = new BlackboardStore(defaults());
    expect(board.get('health')).toBe(100);
    board.set('health', 60);
    expect(board.get('health')).toBe(60);
    expect(board.owns('health')).toBe(true);
  });

  it('inherits latest parent values without copying', () => {
    const root = new BlackboardStore(defaults());
    const squad = root.fork();
    const guard = squad.fork();
    root.set('alert', true);
    expect(guard.get('alert')).toBe(true);
    expect(guard.owns('alert')).toBe(false);
    expect(guard.snapshot()).toEqual({health: 100, target: null, alert: true});
  });

  it('shadows parent values without changing ancestors or other children', () => {
    const root = new BlackboardStore(defaults());
    const guardA = root.fork({health: 50});
    const guardB = root.fork();
    guardB.set('health', 20);
    root.set('health', 90);
    expect(root.get('health')).toBe(90);
    expect(guardA.get('health')).toBe(50);
    expect(guardB.get('health')).toBe(20);
    guardA.clearOverride('health');
    expect(guardA.get('health')).toBe(90);
    expect(guardA.owns('health')).toBe(false);
  });

  it('notifies descendants of inherited changes unless shadowed', () => {
    const root = new BlackboardStore(defaults());
    const squad = root.fork();
    const guard = squad.fork();
    const spy = vi.fn();
    const unsubscribe = guard.subscribe(spy);
    root.set('health', 80);
    expect(spy).toHaveBeenCalledWith({key: 'health', previous: 100, current: 80, origin: 'inherited'});
    guard.set('health', 30);
    root.set('health', 70);
    expect(spy).toHaveBeenCalledTimes(2);
    guard.clearOverride('health');
    expect(spy).toHaveBeenLastCalledWith({key: 'health', previous: 30, current: 70, origin: 'inherited'});
    unsubscribe();
    unsubscribe(); // idempotent
    root.set('health', 60);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('does not emit redundant changes and supports duplicate callback subscriptions', () => {
    const root = new BlackboardStore(defaults());
    const spy = vi.fn();
    const first = root.subscribe(spy);
    const second = root.subscribe(spy);
    root.set('health', 100);
    expect(spy).not.toHaveBeenCalled();
    root.set('health', 99);
    expect(spy).toHaveBeenCalledTimes(2);
    first();
    root.set('health', 98);
    expect(spy).toHaveBeenCalledTimes(3);
    second();
    root.set('health', 97);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('throws for unknown keys and clearing the root', () => {
    const root = new BlackboardStore(defaults());
    expect(() => root.get('missing' as 'health')).toThrow('Unknown blackboard key');
    expect(() => root.clearOverride('health')).toThrow('Root blackboard keys');
    expect(root.fork().clearOverride('health')).toBe(false);
  });

  it('returns a shallow snapshot detached from primitive changes', () => {
    const root = new BlackboardStore(defaults());
    const snapshot = root.snapshot();
    root.set('health', 5);
    snapshot.health = 200;
    expect(root.get('health')).toBe(5);
  });
});
