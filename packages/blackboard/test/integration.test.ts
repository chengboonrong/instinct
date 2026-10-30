import {describe, expect, it} from 'vitest';
import {Action, Agent, Condition, Sequence} from '@instinct/core';
import {StateMachine, type MachineConfig} from '@instinct/hsm';
import {BlackboardStore} from '../src/index.js';

type Event = {type: 'SPOTTED' | 'LOST'};
interface EnemyData { target: string | null; attacks: number }

describe('shared Behavior Tree / HSM blackboard', () => {
  it('shares one typed store without copying or global state', () => {
    const world = new BlackboardStore<EnemyData>({target: null, attacks: 0});
    const guard = world.fork();
    const config: MachineConfig<BlackboardStore<EnemyData>, Event> = {
      initial: 'patrol',
      states: {
        patrol: {on: {SPOTTED: {target: 'combat', guard: ctx => ctx.get('target') !== null}}},
        combat: {on: {LOST: {target: 'patrol', action: ctx => ctx.set('target', null)}}},
      },
    };
    const machine = new StateMachine(config, guard);
    const tree = new Agent(
      new Sequence<BlackboardStore<EnemyData>>([
        new Condition(ctx => ctx.blackboard.get('target') !== null),
        new Action(ctx => {
          ctx.blackboard.set('attacks', ctx.blackboard.get('attacks') + 1);
          return 'success';
        }),
      ]),
      guard,
    );
    machine.start();
    guard.set('target', 'Amir');
    machine.send({type: 'SPOTTED'});
    expect(machine.state).toBe('combat');
    expect(tree.tick(1 / 60)).toBe('success');
    expect(guard.get('attacks')).toBe(1);
    expect(world.get('attacks')).toBe(0);
    machine.send({type: 'LOST'});
    expect(tree.tick(1 / 60)).toBe('failure');
    expect(machine.state).toBe('patrol');
  });
});
