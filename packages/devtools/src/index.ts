import type {Status} from '@instinct/core';
import type {BlackboardChange, BlackboardStore} from '@instinct/blackboard';
import type {GraphObserver, GraphNodeEvent} from '@instinct/definition';

export type DisplayStatus = Status | 'aborted';
export interface TraceEntry {
  readonly sequence: number;
  readonly tick: number;
  readonly kind: 'node' | 'blackboard';
  readonly nodeId?: string;
  readonly status?: DisplayStatus;
  readonly key?: string;
  readonly origin?: 'local' | 'inherited';
  readonly previous?: string;
  readonly current?: string;
}
export interface TraceSnapshot {
  readonly tick: number;
  readonly nodeStatuses: Readonly<Record<string, DisplayStatus>>;
  readonly entries: readonly TraceEntry[];
  readonly blackboard: Readonly<Record<string, string>>;
}
export interface RecorderOptions {
  /** Maximum trace entries retained in memory. Defaults to 256, maximum 8192. */
  readonly capacity?: number;
}

/** Converts values for local debug display, never retains arbitrary object references. */
export function previewValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value.length > 90 ? value.slice(0, 90) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol') return '[symbol]';
  if (typeof value === 'function') return '[function]';
  if (Array.isArray(value)) return '[array: ' + value.length + ']';
  return '[object]';
}

export class TraceRecorder implements GraphObserver {
  private tickNumber = 0;
  private sequence = 0;
  private readonly limit: number;
  private readonly entries: TraceEntry[] = [];
  private readonly statuses = new Map<string, DisplayStatus>();
  private memory: Readonly<Record<string, string>> = {};
  private readonly subscriptions = new Set<() => void>();
  private disposed = false;

  constructor(options: RecorderOptions = {}) {
    const capacity = options.capacity ?? 256;
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 8192) {
      throw new RangeError('Trace capacity must be an integer between 1 and 8192');
    }
    this.limit = capacity;
  }

  /** Call once before an AI tick. Nodes not visited on that tick are no longer highlighted. */
  beginTick(): void {
    if (this.disposed) throw new Error('TraceRecorder is disposed');
    this.tickNumber++;
    this.statuses.clear();
  }

  onNodeEvent(event: GraphNodeEvent): void {
    if (this.disposed) return;
    const status: DisplayStatus = event.type === 'abort' ? 'aborted' : event.status!;
    this.statuses.set(event.nodeId, status);
    this.push({kind: 'node', nodeId: event.nodeId, status});
  }

  /** Observe typed BlackboardStore writes (including changes inherited by this scope). */
  watchBlackboard<S extends object>(board: BlackboardStore<S>): () => void {
    if (this.disposed) throw new Error('TraceRecorder is disposed');
    this.captureMemory(board.snapshot());
    const unsubscribe = board.subscribe((change: BlackboardChange<S>) => {
      if (this.disposed) return;
      this.captureMemory(board.snapshot());
      this.push({
        kind: 'blackboard', key: String(change.key), origin: change.origin,
        previous: previewValue(change.previous), current: previewValue(change.current),
      });
    });
    let subscribed = true;
    const stop = () => {
      if (!subscribed) return;
      subscribed = false;
      unsubscribe();
      this.subscriptions.delete(stop);
    };
    this.subscriptions.add(stop);
    return stop;
  }

  /** Defensive copies prevent UI mutation of the internal recording. */
  snapshot(): TraceSnapshot {
    return {
      tick: this.tickNumber,
      nodeStatuses: Object.fromEntries(this.statuses),
      entries: this.entries.map(e => ({...e})),
      blackboard: {...this.memory},
    };
  }

  clear(): void {
    if (this.disposed) throw new Error('TraceRecorder is disposed');
    this.tickNumber = 0;
    this.sequence = 0;
    this.entries.length = 0;
    this.statuses.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const stop of [...this.subscriptions]) stop();
    this.entries.length = 0;
    this.statuses.clear();
    this.memory = {};
  }

  private captureMemory(memory: object): void {
    const visible: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, value] of Object.entries(memory)) visible[key] = previewValue(value);
    this.memory = visible;
  }

  private push(data: Omit<TraceEntry, 'sequence' | 'tick'>): void {
    this.entries.push({...data, tick: this.tickNumber, sequence: ++this.sequence});
    if (this.entries.length > this.limit) this.entries.shift();
  }
}
