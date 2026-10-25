import {describe, expect, it, vi} from 'vitest';
import {StateMachine, type MachineConfig} from '../src/index.js';

type Event = {type: 'SEE_ENEMY' | 'LOSE_ENEMY' | 'HIT' | 'DIE' | 'RESET' | 'INTERNAL' | 'PING'};
type Context = {health: number; log: string[]; machine?: StateMachine<Context, Event>};
const testConfig = (): MachineConfig<Context, Event> => ({
  initial: 'patrol',
  states: {
    patrol: {
      enter: ctx => ctx.log.push('enter patrol'),
      exit: ctx => ctx.log.push('exit patrol'),
      on: {SEE_ENEMY: 'combat.chase'},
    },
    combat: {
      initial: 'chase',
      enter: ctx => ctx.log.push('enter combat'),
      exit: ctx => ctx.log.push('exit combat'),
      update: ctx => ctx.log.push('update combat'),
      on: {
        LOSE_ENEMY: 'patrol',
        DIE: 'dead',
      },
      states: {
        chase: {
          enter: ctx => ctx.log.push('enter chase'),
          exit: ctx => ctx.log.push('exit chase'),
          update: ctx => ctx.log.push('update chase'),
          on: {
            HIT: [
              {target: 'combat.retreat', guard: ctx => ctx.health < 30},
              {target: 'combat.attack'},
            ],
          },
        },
        attack: {
          enter: ctx => ctx.log.push('enter attack'),
          exit: ctx => ctx.log.push('exit attack'),
          on: {RESET: 'combat.chase'},
        },
        retreat: {enter: ctx => ctx.log.push('enter retreat')},
      },
    },
    dead: {enter: ctx => ctx.log.push('enter dead')},
  },
});
const setup = (health = 100) => {
  const context: Context = {health, log: []};
  const machine = new StateMachine<Context, Event>(testConfig(), context);
  context.machine = machine;
  machine.start();
  return {machine, context};
};

describe('hierarchical state machines', () => {
  it('enters initial state and resolves nested initial states', () => {
    const {machine, context} = setup();
    expect(machine.state).toBe('patrol');
    machine.send({type: 'SEE_ENEMY'});
    expect(machine.state).toBe('combat.chase');
    expect(context.log).toEqual(['enter patrol', 'exit patrol', 'enter combat', 'enter chase']);
    expect(machine.matches('combat')).toBe(true);
    expect(machine.matches('com')).toBe(false);
  });

  it('uses guard fallback and preserves common ancestor on sibling transitions', () => {
    const {machine, context} = setup(50);
    machine.send({type: 'SEE_ENEMY'});
    context.log.length = 0;
    machine.send({type: 'HIT'});
    expect(machine.state).toBe('combat.attack');
    expect(context.log).toEqual(['exit chase', 'enter attack']);
    machine.send({type: 'RESET'});
    expect(machine.state).toBe('combat.chase');
  });

  it('selects guarded retreat and falls back to ancestor handlers', () => {
    const {machine, context} = setup(10);
    machine.send({type: 'SEE_ENEMY'});
    machine.send({type: 'HIT'});
    expect(machine.state).toBe('combat.retreat');
    machine.send({type: 'LOSE_ENEMY'});
    expect(machine.state).toBe('patrol');
    expect(context.log.slice(-3)).toEqual(['enter retreat', 'exit combat', 'enter patrol']);
  });

  it('updates parent before child and drains update-generated events afterward', () => {
    const config = testConfig();
    const context: Context = {health: 100, log: []};
    const machine = new StateMachine<Context, Event>(config, context);
    machine.start();
    machine.send({type: 'SEE_ENEMY'});
    context.log.length = 0;
    machine.update(0.016);
    expect(context.log).toEqual(['update combat', 'update chase']);
  });

  it('re-enters leaf on explicit self transition', () => {
    const config: MachineConfig<Context, Event> = {
      initial: 'idle',
      states: {idle: {enter: ctx => ctx.log.push('enter'), exit: ctx => ctx.log.push('exit'), on: {RESET: 'idle'}}},
    };
    const context: Context = {health: 100, log: []};
    const machine = new StateMachine(config, context);
    machine.start();
    machine.send({type: 'RESET'});
    expect(context.log).toEqual(['enter', 'exit', 'enter']);
  });

  it('handles internal action-only transitions without state changes', () => {
    const config: MachineConfig<Context, Event> = {
      initial: 'idle',
      states: {idle: {on: {INTERNAL: {action: ctx => ctx.log.push('internal')}}}},
    };
    const context: Context = {health: 100, log: []};
    const machine = new StateMachine(config, context);
    machine.start();
    machine.send({type: 'INTERNAL'});
    expect(machine.state).toBe('idle');
    expect(context.log).toEqual(['internal']);
  });

  it('queues send() invoked from entry callbacks instead of re-entering transition execution', () => {
    const config: MachineConfig<Context, Event> = {
      initial: 'idle',
      states: {
        idle: {
          enter: ctx => {ctx.log.push('idle enter'); ctx.machine!.send({type: 'PING'});},
          on: {PING: 'ready'},
        },
        ready: {enter: ctx => ctx.log.push('ready enter')},
      },
    };
    const context: Context = {health: 100, log: []};
    const machine = new StateMachine(config, context);
    context.machine = machine;
    machine.start();
    expect(machine.state).toBe('ready');
    expect(context.log).toEqual(['idle enter', 'ready enter']);
  });

  it('rejects undefined states before exit side effects', () => {
    const config: MachineConfig<Context, Event> = {
      initial: 'idle', states: {idle: {exit: vi.fn(), on: {HIT: 'missing'}}},
    };
    const context: Context = {health: 100, log: []};
    const machine = new StateMachine(config, context);
    machine.start();
    expect(() => machine.send({type: 'HIT'})).toThrow('Unknown state');
    expect(machine.state).toBe('idle');
    expect(config.states.idle!.exit).not.toHaveBeenCalled();
  });

  it('stops and restarts safely', () => {
    const {machine, context} = setup();
    machine.stop();
    expect(machine.state).toBe(null);
    expect(machine.matches('patrol')).toBe(false);
    expect(() => machine.send({type: 'HIT'})).toThrow('Start the machine');
    machine.start();
    expect(machine.state).toBe('patrol');
    expect(context.log).toEqual(['enter patrol', 'exit patrol', 'enter patrol']);
  });

  it('prevents event loops from freezing the game frame', () => {
    const config: MachineConfig<Context, Event> = {
      initial: 'idle',
      states: {idle: {on: {PING: {action: ctx => ctx.machine!.send({type: 'PING'})}}}},
    };
    const context: Context = {health: 100, log: []};
    const machine = new StateMachine(config, context, {maxEventsPerDrain: 3});
    context.machine = machine;
    machine.start();
    expect(() => machine.send({type: 'PING'})).toThrow('Event limit exceeded');
    expect(machine.state).toBe('idle');
    // The previous event loop was discarded, not left queued for the next call.
    expect(() => machine.update(0.01)).not.toThrow();
  });

  it('rejects invalid timesteps', () => {
    const {machine} = setup();
    expect(() => machine.update(-1)).toThrow(RangeError);
    expect(() => machine.update(Number.NaN)).toThrow(RangeError);
  });
});
