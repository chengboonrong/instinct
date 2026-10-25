import type {Agent} from '@instinct/core';
import type {BlackboardStore} from '@instinct/blackboard';
import type {EventObject, StateMachine} from '@instinct/hsm';
import type {Object3D, Vector3} from 'three';

export interface MoveOptions {
  readonly speed: number;
  readonly dt: number;
  readonly tolerance?: number;
}

/** Move toward a local-space point on X/Z, without changing height or overshooting. */
export function moveTowards(object: Object3D, target: Readonly<Vector3>, options: MoveOptions): boolean {
  const {speed, dt, tolerance = 0.05} = options;
  if (![speed, dt, tolerance].every(Number.isFinite) || speed < 0 || dt < 0 || tolerance < 0) {
    throw new RangeError('speed, dt and tolerance must be finite and nonnegative');
  }
  const dx = target.x - object.position.x;
  const dz = target.z - object.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= tolerance) return true;
  const travel = Math.min(distance, speed * dt);
  if (travel > 0) {
    object.position.x += (dx / distance) * travel;
    object.position.z += (dz / distance) * travel;
  }
  return distance - travel <= tolerance;
}

/** Turn local +Z toward a local-space target using shortest-arc yaw. */
export function turnTowards(
  object: Object3D, target: Readonly<Vector3>, angularSpeed: number, dt: number, tolerance = 0.01,
): boolean {
  if (![angularSpeed, dt, tolerance].every(Number.isFinite) || angularSpeed < 0 || dt < 0 || tolerance < 0) {
    throw new RangeError('angularSpeed, dt and tolerance must be finite and nonnegative');
  }
  const dx = target.x - object.position.x;
  const dz = target.z - object.position.z;
  if (dx === 0 && dz === 0) return true;
  const desired = Math.atan2(dx, dz);
  const difference = Math.atan2(Math.sin(desired - object.rotation.y), Math.cos(desired - object.rotation.y));
  const step = Math.min(Math.abs(difference), angularSpeed * dt);
  object.rotation.y += Math.sign(difference) * step;
  return Math.abs(difference) - step <= tolerance;
}

export interface ThreeAgentOptions<S extends object, E extends EventObject = EventObject> {
  readonly object: Object3D;
  readonly blackboard: BlackboardStore<S>;
  readonly machine?: StateMachine<BlackboardStore<S>, E>;
  /** Optional default behavior for states with no assigned tree. */
  readonly behavior?: Agent<BlackboardStore<S>>;
  /** State path -> behavior. Nearest matching ancestor takes priority. */
  readonly behaviors?: Readonly<Record<string, Agent<BlackboardStore<S>>>>;
  readonly sense?: (agent: ThreeAgent<S, E>, dt: number) => void;
}

/** Per-object controller. Does not own a render loop, WebGL renderer or physics state. */
export class ThreeAgent<S extends object, E extends EventObject = EventObject> {
  readonly object: Object3D;
  readonly blackboard: BlackboardStore<S>;
  readonly machine: StateMachine<BlackboardStore<S>, E> | undefined;
  private readonly fallback: Agent<BlackboardStore<S>> | undefined;
  private readonly behaviors: Readonly<Record<string, Agent<BlackboardStore<S>>>>;
  private readonly sense: ((agent: ThreeAgent<S, E>, dt: number) => void) | undefined;
  private activeBehavior: Agent<BlackboardStore<S>> | undefined;
  private started = false;
  private disposed = false;

  constructor(options: ThreeAgentOptions<S, E>) {
    if (options.behaviors && !options.machine) {
      throw new Error('State-specific behaviors require an HSM');
    }
    this.object = options.object;
    this.blackboard = options.blackboard;
    this.machine = options.machine;
    this.fallback = options.behavior;
    this.behaviors = options.behaviors ?? {};
    this.sense = options.sense;
    for (const tree of [options.behavior, ...Object.values(this.behaviors)]) {
      if (tree && tree.blackboard !== this.blackboard) {
        throw new Error('Every behavior must reference the same BlackboardStore as its ThreeAgent');
      }
    }
    if (options.machine && options.machine.context !== this.blackboard) {
      throw new Error('HSM must reference the same BlackboardStore as its ThreeAgent');
    }
  }

  get running(): boolean { return this.started && !this.disposed; }

  start(): void {
    if (this.disposed) throw new Error('ThreeAgent is disposed');
    if (this.started) return;
    this.machine?.start();
    this.started = true;
    this.syncBehavior();
  }

  /** Routes HSM events and cancels displaced running trees immediately. */
  send(event: E): void {
    if (!this.running) throw new Error('Start the ThreeAgent before sending events');
    if (!this.machine) throw new Error('This ThreeAgent has no HSM');
    this.machine.send(event);
    this.syncBehavior();
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and nonnegative');
    if (!this.running) return;
    this.sense?.(this, dt);
    this.machine?.update(dt);
    this.syncBehavior();
    this.activeBehavior?.tick(dt);
  }

  stop(): void {
    if (!this.started) return;
    this.activeBehavior?.stop();
    this.activeBehavior = undefined;
    this.started = false;
    this.machine?.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
  }

  private syncBehavior(): void {
    let next = this.fallback;
    const state = this.machine?.state;
    if (state) {
      let path = state;
      while (path) {
        if (Object.prototype.hasOwnProperty.call(this.behaviors, path)) {
          next = this.behaviors[path];
          break;
        }
        const cut = path.lastIndexOf('.');
        path = cut < 0 ? '' : path.slice(0, cut);
      }
    }
    if (next === this.activeBehavior) return;
    this.activeBehavior?.stop();
    this.activeBehavior = next;
  }
}

export interface ScheduledAgent { update(dt: number): void; }

export interface SchedulingOptions {
  readonly hz?: number;
  readonly maxStepsPerFrame?: number;
  readonly maxAccumulatedSeconds?: number;
}
interface Entry {
  readonly agent: ScheduledAgent;
  readonly interval: number;
  readonly maxSteps: number;
  readonly maxAccumulated: number;
  accumulator: number;
}
export interface SchedulerStats {
  readonly updates: number;
  readonly discardedSeconds: number;
  readonly agents: number;
}

/**
 * Fixed-rate scheduler, independent of rendering. Excess catch-up time is
 * discarded to avoid unbounded CPU spikes following browser suspension.
 */
export class AgentScheduler {
  private readonly entries = new Set<Entry>();

  add(agent: ScheduledAgent, options: SchedulingOptions = {}): () => void {
    if ([...this.entries].some(entry => entry.agent === agent)) {
      throw new Error('Agent is already registered with this scheduler');
    }
    const hz = options.hz ?? 15;
    const maxSteps = options.maxStepsPerFrame ?? 2;
    const maxAccumulated = options.maxAccumulatedSeconds ?? 0.25;
    if (!Number.isFinite(hz) || hz <= 0 || !Number.isSafeInteger(maxSteps) || maxSteps < 1 ||
        !Number.isFinite(maxAccumulated) || maxAccumulated <= 0) {
      throw new RangeError('Scheduling options must be finite, positive values');
    }
    const interval = 1 / hz;
    if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('Unsupported tick frequency');
    const entry: Entry = {agent, interval, maxSteps, maxAccumulated: Math.max(interval, maxAccumulated), accumulator: 0};
    this.entries.add(entry);
    return () => { this.entries.delete(entry); };
  }

  tick(dt: number): SchedulerStats {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and nonnegative');
    let updates = 0;
    let discardedSeconds = 0;
    for (const entry of this.entries) {
      const total = entry.accumulator + dt;
      entry.accumulator = Math.min(total, entry.maxAccumulated);
      discardedSeconds += total - entry.accumulator;
      let steps = 0;
      while (entry.accumulator + Number.EPSILON >= entry.interval && steps < entry.maxSteps) {
        entry.accumulator = Math.max(0, entry.accumulator - entry.interval);
        entry.agent.update(entry.interval);
        steps++;
        updates++;
      }
      if (entry.accumulator + Number.EPSILON >= entry.interval) {
        const skipped = Math.floor((entry.accumulator + Number.EPSILON) / entry.interval);
        const lost = skipped * entry.interval;
        entry.accumulator = Math.max(0, entry.accumulator - lost);
        discardedSeconds += lost;
      }
    }
    return {updates, discardedSeconds, agents: this.entries.size};
  }

  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}
