/** String keys allow fast access and stable serialization names. */
export type BlackboardKey<S extends object> = Extract<keyof S, string>;

export interface BlackboardChange<S extends object> {
  readonly key: BlackboardKey<S>;
  readonly previous: S[BlackboardKey<S>];
  readonly current: S[BlackboardKey<S>];
  /** Whether the visible value changed in this scope or was inherited. */
  readonly origin: 'local' | 'inherited';
}

export type BlackboardListener<S extends object> = (change: BlackboardChange<S>) => void;

/**
 * A typed hierarchical key-value store for game AI.
 *
 * Reads walk the parent chain; writes always affect the current scope. This
 * allows several NPCs to read world or squad data without sharing their local
 * decision state. Parent changes are observed by children that have subscribed
 * and have not shadowed the changed key.
 *
 * Type safety is enforced by TypeScript, not by runtime schemas. Object values
 * are held by reference; mutate through set() to produce change notifications.
 */
export class BlackboardStore<S extends object> {
  private readonly local = new Map<BlackboardKey<S>, S[BlackboardKey<S>]>();
  private readonly listeners = new Set<BlackboardListener<S>>();
  private unsubscribeParent: (() => void) | undefined;

  constructor(initial: S, private readonly parent?: BlackboardStore<S>) {
    for (const key of Object.keys(initial) as BlackboardKey<S>[]) {
      this.local.set(key, initial[key]);
    }
  }

  /** Create a child scope, optionally shadowing inherited keys immediately. */
  fork(overrides: Partial<S> = {}): BlackboardStore<S> {
    return new BlackboardStore(overrides as S, this);
  }

  /** Read a value, using the nearest ancestor when it is not overridden. */
  get<K extends BlackboardKey<S>>(key: K): S[K] {
    if (this.local.has(key)) return this.local.get(key) as S[K];
    if (this.parent) return this.parent.get(key);
    throw new Error(`Unknown blackboard key: ${key}`);
  }

  /** Write only to this scope, leaving ancestor state unchanged. */
  set<K extends BlackboardKey<S>>(key: K, value: S[K]): void {
    const previous = this.get(key);
    this.local.set(key, value);
    if (!Object.is(previous, value)) {
      this.emit({key, previous, current: value, origin: 'local'});
    }
  }

  /** True when this scope has an override for the key. */
  owns<K extends BlackboardKey<S>>(key: K): boolean {
    return this.local.has(key);
  }

  /** Remove a child override and resume reading the parent value. */
  clearOverride<K extends BlackboardKey<S>>(key: K): boolean {
    if (!this.parent) throw new Error('Root blackboard keys cannot be cleared');
    if (!this.local.has(key)) return false;
    const previous = this.get(key);
    this.local.delete(key);
    const current = this.get(key);
    if (!Object.is(previous, current)) {
      this.emit({key, previous, current, origin: 'inherited'});
    }
    return true;
  }

  /** A shallow snapshot of the visible key set; not a live or deep-frozen view. */
  snapshot(): S {
    return {...(this.parent?.snapshot() ?? {}), ...Object.fromEntries(this.local)} as S;
  }

  /**
   * Listen for visible value changes. Parent listeners are attached lazily and
   * released when the last subscriber unsubscribes, avoiding idle-agent leaks.
   */
  subscribe(listener: BlackboardListener<S>): () => void {
    const hadListeners = this.listeners.size > 0;
    const wrapper: BlackboardListener<S> = change => listener(change);
    this.listeners.add(wrapper);
    if (!hadListeners && this.parent) {
      this.unsubscribeParent = this.parent.subscribe(change => {
        if (!this.local.has(change.key)) {
          this.emit({...change, origin: 'inherited'});
        }
      });
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(wrapper);
      if (this.listeners.size === 0) {
        this.unsubscribeParent?.();
        this.unsubscribeParent = undefined;
      }
    };
  }

  private emit(change: BlackboardChange<S>): void {
    for (const listener of this.listeners) listener(change);
  }
}
