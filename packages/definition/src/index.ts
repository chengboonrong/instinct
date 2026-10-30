import {Action, Condition, Inverter, ReactiveSelector, Selector, Sequence, type ActionFn, type ConditionFn, type Node} from '@instinct/core';

export const GRAPH_VERSION = 1 as const;
export const NODE_KINDS = ['sequence', 'selector', 'reactiveSelector', 'inverter', 'action', 'condition'] as const;
export type BehaviorKind = (typeof NODE_KINDS)[number];
export interface TreePosition {x: number; y: number;}
export interface TreeNode {
  readonly id: string;
  readonly kind: BehaviorKind;
  readonly label: string;
  /** Registered behavior key, required on action and condition nodes. */
  readonly task?: string;
  /** Explicit execution priority; ordered left-to-right in the editor inspector. */
  readonly children: readonly string[];
  readonly position: TreePosition;
}
export interface BehaviorGraph {
  readonly version: typeof GRAPH_VERSION;
  readonly rootId: string;
  readonly nodes: readonly TreeNode[];
}
export interface GraphIssue {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly GraphIssue[];
}

const kinds: ReadonlySet<string> = new Set<string>(NODE_KINDS);
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const keyPattern = /^[A-Za-z0-9_.-]{1,80}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateGraph(input: unknown): ValidationResult {
  const issues: GraphIssue[] = [];
  const add = (code: string, message: string, nodeId?: string) => issues.push({code, message, ...(nodeId ? {nodeId} : {})});
  if (!record(input)) return {valid: false, issues: [{code: 'format', message: 'Expected a graph object'}]};
  if (input.version !== GRAPH_VERSION) add('version', 'Unsupported graph version; expected 1');
  if (!Array.isArray(input.nodes) || input.nodes.length > 256 || input.nodes.length === 0) {
    add('nodes', 'A graph must contain 1–256 nodes');
    return {valid: false, issues};
  }
  const nodes = new Map<string, TreeNode>();
  for (const raw of input.nodes) {
    if (!record(raw)) {add('node', 'Node must be an object'); continue;}
    const id = raw.id;
    if (typeof id !== 'string' || !idPattern.test(id)) {
      add('id', 'Node IDs must contain 1–64 letters, digits, underscores or hyphens');
      continue;
    }
    if (nodes.has(id)) {add('duplicate', 'Duplicate node ID', id); continue;}
    if (typeof raw.kind !== 'string' || !kinds.has(raw.kind)) add('kind', 'Unknown behavior node kind', id);
    if (typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > 80) add('label', 'Label must be 1–80 characters', id);
    if (!Array.isArray(raw.children) || raw.children.some(c => typeof c !== 'string' || !idPattern.test(c))) {
      add('children', 'Children must be an array of valid node IDs', id);
    }
    if (!record(raw.position) || typeof raw.position.x !== 'number' || !Number.isFinite(raw.position.x) ||
        typeof raw.position.y !== 'number' || !Number.isFinite(raw.position.y)) {
      add('position', 'Node must have finite x/y coordinates', id);
    }
    if (raw.kind === 'action' || raw.kind === 'condition') {
      if (typeof raw.task !== 'string' || !keyPattern.test(raw.task)) {
        add('task', 'Leaf nodes require a registered task key', id);
      }
      if (Array.isArray(raw.children) && raw.children.length > 0) add('arity', 'Leaf nodes cannot have children', id);
    } else if (raw.kind === 'inverter') {
      if (Array.isArray(raw.children) && raw.children.length !== 1) add('arity', 'Inverter requires exactly one child', id);
    } else if (kinds.has(String(raw.kind))) {
      if (Array.isArray(raw.children) && raw.children.length === 0) add('arity', 'Composite requires at least one child', id);
    }
    // Validation completes before the representation is ever passed to the compiler.
    nodes.set(id, raw as unknown as TreeNode);
  }
  if (typeof input.rootId !== 'string' || !nodes.has(input.rootId)) add('root', 'rootId must reference an existing node');
  const parent = new Map<string, string>();
  for (const [id, node] of nodes) {
    if (!Array.isArray(node.children)) continue;
    for (const childId of node.children) {
      if (!nodes.has(childId)) {add('missing-child', 'Child node does not exist: ' + childId, id); continue;}
      if (parent.has(childId)) add('multi-parent', 'Each child must have exactly one parent', childId);
      parent.set(childId, id);
    }
  }
  if (typeof input.rootId === 'string' && parent.has(input.rootId)) add('root-parent', 'Root node cannot have an incoming edge', input.rootId);
  const active = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (active.has(id)) {add('cycle', 'Cycle detected', id); return;}
    if (visited.has(id)) return;
    if (depth > 256) {add('depth', 'Graph is too deep', id); return;}
    const node = nodes.get(id);
    if (!node) return;
    active.add(id);
    for (const child of Array.isArray(node.children) ? node.children : []) {
      if (typeof child === 'string' && nodes.has(child)) walk(child, depth + 1);
    }
    active.delete(id);
    visited.add(id);
  };
  if (typeof input.rootId === 'string') walk(input.rootId, 0);
  // Walk disconnected components too, so cycles always produce useful diagnostics.
  for (const id of nodes.keys()) if (!visited.has(id)) walk(id, 0);
  for (const id of nodes.keys()) if (id !== input.rootId && !parent.has(id)) add('orphan', 'Node is not attached to the root', id);
  return {valid: issues.length === 0, issues};
}

export class GraphValidationError extends Error {
  constructor(readonly issues: readonly GraphIssue[]) {
    super(issues.map(i => i.message + (i.nodeId ? ' [' + i.nodeId + ']' : '')).join('; '));
    this.name = 'GraphValidationError';
  }
}

/** Parse untrusted editor data; validation happens before runtime compilation. */
export function parseGraph(json: string): BehaviorGraph {
  if (json.length > 128_000) throw new Error('Graph JSON exceeds the 128 KB limit');
  let parsed: unknown;
  try {parsed = JSON.parse(json) as unknown;} catch {throw new GraphValidationError([{code: 'json', message: 'Malformed JSON'}]);}
  const result = validateGraph(parsed);
  if (!result.valid) throw new GraphValidationError(result.issues);
  return parsed as BehaviorGraph;
}

export function serializeGraph(graph: BehaviorGraph): string {
  const result = validateGraph(graph);
  if (!result.valid) throw new GraphValidationError(result.issues);
  return JSON.stringify(graph, null, 2);
}

export interface BehaviorRegistry<B extends object> {
  readonly actions: Readonly<Record<string, ActionFn<B> | {readonly run: ActionFn<B>; readonly onAbort?: () => void}>>;
  readonly conditions: Readonly<Record<string, ConditionFn<B>>>;
}

/**
 * Instantiate a new stateful tree for EACH agent. A graph can be shared; the
 * returned Node instances cannot be shared between independently ticking NPCs.
 */
export function compileGraph<B extends object>(graph: unknown, registry: BehaviorRegistry<B>): Node<B> {
  const validation = validateGraph(graph);
  if (!validation.valid) throw new GraphValidationError(validation.issues);
  const data = graph as BehaviorGraph;
  const byId = new Map(data.nodes.map(node => [node.id, node]));
  const build = (id: string): Node<B> => {
    const node = byId.get(id)!;
    const children = node.children.map(build);
    switch (node.kind) {
      case 'sequence': return new Sequence(children);
      case 'selector': return new Selector(children);
      case 'reactiveSelector': return new ReactiveSelector(children);
      case 'inverter': return new Inverter(children[0]!);
      case 'action': {
        const value = Object.prototype.hasOwnProperty.call(registry.actions, node.task!)
          ? registry.actions[node.task!] : undefined;
        if (!value) throw new Error('Unknown action: ' + node.task);
        return typeof value === 'function' ? new Action(value) : new Action(value.run, value.onAbort);
      }
      case 'condition': {
        const value = Object.prototype.hasOwnProperty.call(registry.conditions, node.task!)
          ? registry.conditions[node.task!] : undefined;
        if (!value) throw new Error('Unknown condition: ' + node.task);
        return new Condition(value);
      }
    }
  };
  return build(data.rootId);
}

export function sampleGraph(): BehaviorGraph {
  return {
    version: 1,
    rootId: 'root',
    nodes: [
      {id: 'root', kind: 'reactiveSelector', label: 'Enemy Priority', children: ['survival', 'combat', 'patrol'], position: {x: 40, y: 260}},
      {id: 'survival', kind: 'sequence', label: 'Survival', children: ['lowHealth', 'retreat'], position: {x: 320, y: 30}},
      {id: 'lowHealth', kind: 'condition', label: 'Low health?', task: 'lowHealth', children: [], position: {x: 630, y: 0}},
      {id: 'retreat', kind: 'action', label: 'Retreat', task: 'retreat', children: [], position: {x: 630, y: 105}},
      {id: 'combat', kind: 'sequence', label: 'Combat', children: ['hasTarget', 'attack'], position: {x: 320, y: 280}},
      {id: 'hasTarget', kind: 'condition', label: 'Has target?', task: 'hasTarget', children: [], position: {x: 630, y: 250}},
      {id: 'attack', kind: 'action', label: 'Attack', task: 'attack', children: [], position: {x: 630, y: 355}},
      {id: 'patrol', kind: 'action', label: 'Patrol', task: 'patrol', children: [], position: {x: 320, y: 530}},
    ],
  };
}
