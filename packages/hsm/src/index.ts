/** Serializable events identify transitions by their type. */
export interface EventObject {
  readonly type: string;
}

export type Guard<C, E extends EventObject> = (context: C, event: E) => boolean;
export type Effect<C, E extends EventObject> = (context: C, event: E) => void;
export type Lifecycle<C, E extends EventObject> = (context: C, event?: E) => void;

/** Transition paths are absolute from the machine root (e.g. "combat.chase"). */
export type Transition<C, E extends EventObject> =
  | string
  | {
      readonly target?: string;
      readonly guard?: Guard<C, E>;
      readonly action?: Effect<C, E>;
    };

export interface StateConfig<C, E extends EventObject> {
  readonly initial?: string;
  readonly states?: Readonly<Record<string, StateConfig<C, E>>>;
  readonly on?: Readonly<Record<string, Transition<C, E> | readonly Transition<C, E>[]>>;
  readonly enter?: Lifecycle<C, E>;
  readonly exit?: Lifecycle<C, E>;
  readonly update?: (context: C, dt: number) => void;
}

export interface MachineConfig<C, E extends EventObject> extends StateConfig<C, E> {
  readonly initial: string;
  readonly states: Readonly<Record<string, StateConfig<C, E>>>;
}

export interface MachineOptions {
  /** Prevent event-triggered transition loops from freezing a game frame. Default: 100. */
  readonly maxEventsPerDrain?: number;
}

/**
 * Small deterministic hierarchical state machine.
 *
 * - Children inherit parent event handlers (leaf handlers take priority).
 * - The target is always an absolute state path; targetless transitions run actions only.
 * - Transitions between siblings preserve their common parent's lifecycle.
 * - Events raised by callbacks are queued and processed after the current callback.
 * - Configurations may be shared; each machine holds its own active state and queue.
 */
export class StateMachine<C, E extends EventObject = EventObject> {
  private path: string[] | null = null;
  private readonly queue: E[] = [];
  private processing = false;
  private readonly maxEventsPerDrain: number;

  constructor(
    private readonly config: MachineConfig<C, E>,
    readonly context: C,
    options: MachineOptions = {},
  ) {
    const limit = options.maxEventsPerDrain ?? 100;
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new RangeError('maxEventsPerDrain must be a positive safe integer');
    }
    this.maxEventsPerDrain = limit;
    this.expandInitial([]); // Validate the initial path without activating callbacks.
  }

  /** Null before start() and after stop(); otherwise the active leaf path. */
  get state(): string | null {
    return this.path?.join('.') ?? null;
  }

  get running(): boolean {
    return this.path !== null;
  }

  /** Matches a state or any of its descendants, respecting path boundaries. */
  matches(state: string): boolean {
    const active = this.state;
    return active !== null && (active === state || active.startsWith(`${state}.`));
  }

  start(): void {
    if (this.path) return;
    if (this.processing) throw new Error('Cannot start during state-machine callbacks');
    const next = this.expandInitial([]);
    this.processing = true;
    this.path = next;
    try {
      for (let length = 1; length <= next.length; length++) {
        this.nodeAt(next.slice(0, length)).enter?.(this.context);
      }
    } catch (error) {
      this.path = null;
      this.queue.length = 0;
      throw error;
    } finally {
      this.processing = false;
    }
    this.drain();
  }

  stop(): void {
    if (this.processing) throw new Error('Cannot stop during state-machine callbacks');
    if (!this.path) return;
    const previous = this.path;
    this.processing = true;
    try {
      for (let length = previous.length; length >= 1; length--) {
        this.nodeAt(previous.slice(0, length)).exit?.(this.context);
      }
    } finally {
      this.path = null;
      this.queue.length = 0;
      this.processing = false;
    }
  }

  /** Send an event immediately, or enqueue it if currently in a callback. */
  send(event: E): void {
    if (!this.running) throw new Error('Start the machine before sending events');
    if (!event || typeof event.type !== 'string' || !event.type) {
      throw new TypeError('Events require a nonempty type');
    }
    this.queue.push(event);
    this.drain();
  }

  /** Update parent states first, then the active leaf; queued events run afterward. */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError('dt must be finite and nonnegative');
    }
    if (!this.path) throw new Error('Start the machine before updating');
    if (this.processing) throw new Error('Cannot update recursively');
    this.processing = true;
    try {
      const path = this.path;
      for (let length = 1; length <= path.length; length++) {
        this.nodeAt(path.slice(0, length)).update?.(this.context, dt);
      }
    } finally {
      this.processing = false;
    }
    this.drain();
  }

  private nodeAt(path: readonly string[]): StateConfig<C, E> {
    let current: StateConfig<C, E> = this.config;
    for (const segment of path) {
      if (!segment || segment.includes('.')) throw new Error(`Invalid state segment: ${segment}`);
      const next: StateConfig<C, E> | undefined = current.states?.[segment];
      if (!next) throw new Error(`Unknown state: ${path.join('.')}`);
      current = next;
    }
    return current;
  }

  private expandInitial(target: readonly string[]): string[] {
    const path = [...target];
    let current = this.nodeAt(path);
    let depth = 0;
    while (current.initial !== undefined) {
      if (++depth > 100) throw new Error('Initial state nesting exceeds 100 levels');
      path.push(current.initial);
      current = this.nodeAt(path);
    }
    if (path.length === 0) throw new Error('Machine must define an initial state');
    return path;
  }

  private resolveTarget(target: string): string[] {
    if (!target || target.startsWith('.') || target.endsWith('.') || target.includes('..')) {
      throw new Error(`Invalid transition target: ${target}`);
    }
    return this.expandInitial(target.split('.'));
  }

  private drain(): void {
    if (this.processing || !this.running) return;
    this.processing = true;
    let handled = 0;
    try {
      while (this.queue.length && this.running) {
        if (++handled > this.maxEventsPerDrain) {
          throw new Error(`Event limit exceeded (${this.maxEventsPerDrain}); possible transition loop`);
        }
        const event = this.queue.shift()!;
        this.process(event);
      }
    } catch (error) {
      this.queue.length = 0;
      throw error;
    } finally {
      this.processing = false;
    }
  }

  private process(event: E): void {
    const path = this.path!;
    // Search from leaf to root, allowing parent handlers as fallbacks.
    for (let length = path.length; length >= 0; length--) {
      const candidate = this.nodeAt(path.slice(0, length)).on?.[event.type];
      if (!candidate) continue;
      const transitions = Array.isArray(candidate) ? candidate : [candidate];
      for (const option of transitions) {
        const transition: Transition<C, E> = option;
        const details = typeof transition === 'string' ? {target: transition} : transition;
        if (details.guard && !details.guard(this.context, event)) continue;
        this.transition(details.target, details.action, event);
        return;
      }
    }
  }

  private transition(target: string | undefined, action: Effect<C, E> | undefined, event: E): void {
    if (target === undefined) {
      action?.(this.context, event);
      return;
    }
    // Resolve before any exit/effect side effects, so invalid targets do not alter the machine.
    const next = this.resolveTarget(target);
    const previous = this.path!;
    let common = 0;
    while (common < previous.length && common < next.length && previous[common] === next[common]) {
      common++;
    }
    // An explicit self transition re-enters its active leaf.
    if (common === previous.length && common === next.length) common--;
    for (let length = previous.length; length > common; length--) {
      this.nodeAt(previous.slice(0, length)).exit?.(this.context, event);
    }
    action?.(this.context, event);
    this.path = next;
    for (let length = common + 1; length <= next.length; length++) {
      this.nodeAt(next.slice(0, length)).enter?.(this.context, event);
    }
  }
}
