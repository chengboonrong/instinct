/** The three standard behavior-tree execution outcomes. */
export type Status = 'success' | 'failure' | 'running';
export type Blackboard = Record<string, unknown>;
export interface Context<B extends Blackboard = Blackboard> {
  readonly blackboard: B;
  readonly dt: number;
}
export interface Node<B extends Blackboard = Blackboard> {
  tick(context: Context<B>): Status;
  /** Cancel running work and restore initial execution state. */
  reset(): void;
}
export type ActionFn<B extends Blackboard> = (context: Context<B>) => Status;
export type ConditionFn<B extends Blackboard> = (context: Context<B>) => boolean;

export class Action<B extends Blackboard = Blackboard> implements Node<B> {
  private active = false;
  constructor(private readonly run: ActionFn<B>, private readonly onAbort?: () => void) {}
  tick(context: Context<B>): Status {
    const status = this.run(context);
    this.active = status === 'running';
    return status;
  }
  reset(): void {
    if (this.active) this.onAbort?.();
    this.active = false;
  }
}

export class Condition<B extends Blackboard = Blackboard> implements Node<B> {
  constructor(private readonly predicate: ConditionFn<B>) {}
  tick(context: Context<B>): Status {
    return this.predicate(context) ? 'success' : 'failure';
  }
  reset(): void {}
}

/** A memory sequence resumes the last running child. */
export class Sequence<B extends Blackboard = Blackboard> implements Node<B> {
  private cursor = 0;
  constructor(private readonly children: readonly Node<B>[]) {}
  tick(context: Context<B>): Status {
    while (this.cursor < this.children.length) {
      const result = this.children[this.cursor]!.tick(context);
      if (result === 'running') return result;
      if (result === 'failure') { this.reset(); return result; }
      this.cursor++;
    }
    this.reset();
    return 'success';
  }
  reset(): void {
    for (const child of this.children) child.reset();
    this.cursor = 0;
  }
}

/** A memory selector resumes the last running branch. */
export class Selector<B extends Blackboard = Blackboard> implements Node<B> {
  private cursor = 0;
  constructor(private readonly children: readonly Node<B>[]) {}
  tick(context: Context<B>): Status {
    while (this.cursor < this.children.length) {
      const result = this.children[this.cursor]!.tick(context);
      if (result === 'running') return result;
      if (result === 'success') { this.reset(); return result; }
      this.cursor++;
    }
    this.reset();
    return 'failure';
  }
  reset(): void {
    for (const child of this.children) child.reset();
    this.cursor = 0;
  }
}

/** Reevaluate higher-priority branches on every tick and abort displaced work. */
export class ReactiveSelector<B extends Blackboard = Blackboard> implements Node<B> {
  private active = -1;
  constructor(private readonly children: readonly Node<B>[]) {}
  tick(context: Context<B>): Status {
    for (let i = 0; i < this.children.length; i++) {
      const result = this.children[i]!.tick(context);
      if (result === 'failure') {
        if (this.active === i) {
          this.children[i]!.reset();
          this.active = -1;
        }
        continue;
      }
      if (this.active !== -1 && this.active !== i) this.children[this.active]!.reset();
      this.active = result === 'running' ? i : -1;
      return result;
    }
    this.reset();
    return 'failure';
  }
  reset(): void {
    for (const child of this.children) child.reset();
    this.active = -1;
  }
}

export class Inverter<B extends Blackboard = Blackboard> implements Node<B> {
  constructor(private readonly child: Node<B>) {}
  tick(context: Context<B>): Status {
    const result = this.child.tick(context);
    return result === 'running' ? result : result === 'success' ? 'failure' : 'success';
  }
  reset(): void { this.child.reset(); }
}

/** Each Agent needs its own node instances: execution state is not shared. */
export class Agent<B extends Blackboard = Blackboard> {
  constructor(readonly root: Node<B>, readonly blackboard: B) {}
  tick(dt: number): Status {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and nonnegative');
    return this.root.tick({dt, blackboard: this.blackboard});
  }
  stop(): void { this.root.reset(); }
}
