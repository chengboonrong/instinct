import {validateGraph, type BehaviorGraph} from '@instinct/definition';
import type {TraceSnapshot} from '@instinct/devtools';

export interface AgentInfo {
  readonly id: string;
  readonly label: string;
}
export interface RemoteFrame extends AgentInfo {
  readonly graph: BehaviorGraph;
  readonly trace: TraceSnapshot;
}
export type BridgeEvent =
  | {readonly type: 'connected'}
  | {readonly type: 'disconnected'}
  | {readonly type: 'roster'; readonly agents: readonly AgentInfo[]}
  | {readonly type: 'frame'; readonly frame: RemoteFrame}
  | {readonly type: 'error'; readonly message: string};
export interface BridgeOptions {
  readonly url?: string;
  /** Per-server short-lived token, entered explicitly by the developer. */
  readonly token: string;
  readonly onEvent?: (event: BridgeEvent) => void;
}
const MAX_MESSAGE_BYTES = 160_000;
const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const STATUSES = new Set(['running', 'success', 'failure', 'aborted']);
const isStatus = (v: unknown): boolean => typeof v === 'string' && STATUSES.has(v);
const safeObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
function ensureUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The development bridge accepts only ws://127.0.0.1 or localhost, without credentials or query parameters');
  }
  return url.href;
}
function validateOptions(options: BridgeOptions): string {
  if (!options.token || options.token.length < 16 || options.token.length > 256) {
    throw new Error('Supply the 16–256 character development bridge token from the local bridge server');
  }
  return ensureUrl(options.url ?? 'ws://127.0.0.1:7331');
}
/** Enforce bounded, inert data. Never run code from a remote graph or trace. */
export function validateRemoteFrame(value: unknown): value is RemoteFrame {
  if (!safeObject(value) || typeof value.id !== 'string' || !AGENT_ID.test(value.id) ||
      typeof value.label !== 'string' || value.label.length > 100 ||
      !validateGraph(value.graph).valid || !safeObject(value.trace)) return false;
  const trace = value.trace;
  if (!Number.isSafeInteger(trace.tick) || (trace.tick as number) < 0 ||
      !safeObject(trace.nodeStatuses) || Object.keys(trace.nodeStatuses).length > 256 ||
      !safeObject(trace.blackboard) || Object.keys(trace.blackboard).length > 96 ||
      !Array.isArray(trace.entries) || trace.entries.length > 256) return false;
  if (Object.entries(trace.nodeStatuses).some(([id, status]) => !AGENT_ID.test(id) || !isStatus(status))) return false;
  if (Object.entries(trace.blackboard).some(([key, text]) => key.length > 80 || typeof text !== 'string' || text.length > 120)) return false;
  for (const event of trace.entries) {
    if (!safeObject(event) || !Number.isSafeInteger(event.sequence) || !Number.isSafeInteger(event.tick) ||
        event.kind !== 'node' && event.kind !== 'blackboard') return false;
    if (event.kind === 'node' && (typeof event.nodeId !== 'string' || !AGENT_ID.test(event.nodeId) ||
        !isStatus(event.status))) return false;
    if (event.kind === 'blackboard' && (typeof event.key !== 'string' || event.key.length > 80 ||
        typeof event.previous !== 'string' || typeof event.current !== 'string')) return false;
  }
  return true;
}
function decode(data: string): unknown {
  if (data.length > MAX_MESSAGE_BYTES) return null;
  try {return JSON.parse(data) as unknown;} catch {return null;}
}
function socketSend(socket: WebSocket, value: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const payload = JSON.stringify(value);
  // The relay limit is in bytes; going over it closes the socket.
  if (new TextEncoder().encode(payload).length > MAX_MESSAGE_BYTES) return;
  socket.send(payload);
}
class BaseConnection {
  protected socket: WebSocket | undefined;
  protected ready = false;
  protected readonly options: BridgeOptions;
  private readonly url: string;
  private closedByUser = false;

  constructor(options: BridgeOptions, private readonly role: 'game' | 'studio') {
    this.options = options;
    this.url = validateOptions(options);
  }

  connect(): void {
    this.close();
    this.closedByUser = false;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      // A canceled connection must never send the session token.
      if (this.socket !== socket || this.closedByUser) {
        if (socket.readyState === WebSocket.OPEN) socket.close();
        return;
      }
      socketSend(socket, {type: 'hello', role: this.role, token: this.options.token});
    });
    socket.addEventListener('message', event => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      const message = decode(event.data);
      if (!safeObject(message)) return;
      if (message.type === 'welcome' && message.role === this.role) {
        this.ready = true;
        this.options.onEvent?.({type: 'connected'});
      } else if (message.type === 'roster' && this.role === 'studio' && Array.isArray(message.agents)) {
        const agents = message.agents.filter((a): a is AgentInfo =>
          safeObject(a) && typeof a.id === 'string' && AGENT_ID.test(a.id) &&
          typeof a.label === 'string' && a.label.length <= 100).slice(0, 100);
        this.options.onEvent?.({type: 'roster', agents});
      } else if (message.type === 'frame' && this.role === 'studio' && validateRemoteFrame(message.frame)) {
        this.options.onEvent?.({type: 'frame', frame: message.frame});
      } else if (message.type === 'error') {
        this.options.onEvent?.({type: 'error', message: String(message.message).slice(0, 150)});
      }
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) this.options.onEvent?.({type: 'error', message: 'Local WebSocket connection error'});
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.ready = false;
      if (!this.closedByUser) this.options.onEvent?.({type: 'disconnected'});
    });
  }

  close(): void {
    this.closedByUser = true;
    this.ready = false;
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) socket.close();
    else if (socket.readyState === WebSocket.CONNECTING) {
      // Browser WebSocket.close() throws in CONNECTING; close once it opens.
      socket.addEventListener('open', () => {
        if (socket.readyState === WebSocket.OPEN) socket.close();
      }, {once: true});
    }
  }
  get connected(): boolean { return this.ready; }
  protected send(message: unknown): void {
    if (this.ready && this.socket) socketSend(this.socket, message);
  }
}

/** Game side: explicitly enabled development-only publisher; sends no commands to the game. */
export class DevtoolsPublisher extends BaseConnection {
  private readonly lastSent = new Map<string, number>();
  constructor(options: BridgeOptions) {super(options, 'game');}
  publish(frame: RemoteFrame): void {
    if (!this.connected || !validateRemoteFrame(frame)) return;
    const now = Date.now();
    const previous = this.lastSent.get(frame.id) ?? -Infinity;
    if (now - previous < 100) return; // cap each agent at 10 snapshots per second
    this.lastSent.set(frame.id, now);
    this.send({type: 'publish', frame});
  }
  remove(id: string): void {
    if (!AGENT_ID.test(id)) return;
    this.lastSent.delete(id);
    this.send({type: 'remove', id});
  }
  override close(): void {super.close(); this.lastSent.clear();}
}

/** Studio side: read-only, remote selection never mutates running agents. */
export class DevtoolsViewer extends BaseConnection {
  constructor(options: BridgeOptions) {super(options, 'studio');}
  select(id: string): void {
    if (!AGENT_ID.test(id)) throw new Error('Invalid remote agent id');
    this.send({type: 'select', id});
  }
}
