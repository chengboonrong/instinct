import {describe, expect, it, vi} from 'vitest';
import {Agent} from '@instinct/core';
import {
  compileGraph, GraphValidationError, parseGraph, sampleGraph, serializeGraph,
  validateGraph, type BehaviorGraph, type BehaviorRegistry, type TreeNode,
} from '../src/index.js';

type Data = {health: number; hasTarget: boolean; events: string[]};
const registry: BehaviorRegistry<Data> = {
  conditions: {
    lowHealth: ({blackboard}) => blackboard.health < 30,
    hasTarget: ({blackboard}) => blackboard.hasTarget,
  },
  actions: {
    retreat: ({blackboard}) => {blackboard.events.push('retreat'); return 'running';},
    attack: ({blackboard}) => {blackboard.events.push('attack'); return 'running';},
    patrol: ({blackboard}) => {blackboard.events.push('patrol'); return 'running';},
  },
};
const data = (health = 100, hasTarget = false): Data => ({health, hasTarget, events: []});

describe('behavior graph definition', () => {
  it('validates and roundtrips the default graph', () => {
    const graph = sampleGraph();
    expect(validateGraph(graph)).toEqual({valid: true, issues: []});
    expect(parseGraph(serializeGraph(graph))).toEqual(graph);
  });

  it('compiles branches with explicit priority order', () => {
    const graph = sampleGraph();
    const memory = data();
    const agent = new Agent(compileGraph(graph, registry), memory);
    expect(agent.tick(0.05)).toBe('running');
    expect(memory.events).toEqual(['patrol']);
    memory.hasTarget = true;
    expect(agent.tick(0.05)).toBe('running');
    expect(memory.events.at(-1)).toBe('attack');
    memory.health = 15;
    expect(agent.tick(0.05)).toBe('running');
    expect(memory.events.at(-1)).toBe('retreat');
  });

  it('instantiates independent stateful nodes for separate agents', () => {
    const graph: BehaviorGraph = {
      version: 1, rootId: 'root',
      nodes: [{id: 'root', kind: 'action', label: 'Wait', task: 'wait', children: [], position: {x: 0, y: 0}}],
    };
    const perInstance: BehaviorRegistry<Data> = {actions: {wait: () => 'running'}, conditions: {}};
    const first = new Agent(compileGraph(graph, perInstance), data());
    const second = new Agent(compileGraph(graph, perInstance), data());
    expect(first.root).not.toBe(second.root);
  });

  it('rejects malformed JSON and incompatible versions', () => {
    expect(() => parseGraph('{oops')).toThrow(GraphValidationError);
    const graph = sampleGraph();
    expect(validateGraph({...graph, version: 2}).issues.some(issue => issue.code === 'version')).toBe(true);
    expect(() => parseGraph(' '.repeat(128_001))).toThrow('128 KB');
  });

  it('detects missing children, disconnected nodes and duplicate IDs', () => {
    const graph = sampleGraph();
    const missing: BehaviorGraph = {...graph, nodes: graph.nodes.map(n => n.id === 'root' ? {...n, children: ['ghost']} : n)};
    const issues = validateGraph(missing).issues.map(item => item.code);
    expect(issues).toContain('missing-child');
    expect(issues).toContain('orphan');
    expect(validateGraph({...graph, nodes: [...graph.nodes, graph.nodes[0]!]}).issues.some(i => i.code === 'duplicate')).toBe(true);
  });

  it('detects shared children and cycles before compiling', () => {
    const graph = sampleGraph();
    const nodes: TreeNode[] = graph.nodes.map(n => n.id === 'combat' ? {...n, children: [...n.children, 'retreat']} : n);
    expect(validateGraph({...graph, nodes}).issues.some(i => i.code === 'multi-parent')).toBe(true);
    const loop: BehaviorGraph = {version: 1, rootId: 'a', nodes: [
      {id: 'a', kind: 'sequence', label: 'A', children: ['b'], position: {x: 0, y: 0}},
      {id: 'b', kind: 'selector', label: 'B', children: ['a'], position: {x: 1, y: 1}},
    ]};
    expect(validateGraph(loop).issues.some(i => i.code === 'cycle')).toBe(true);
    expect(() => compileGraph(loop, registry)).toThrow(GraphValidationError);
  });

  it('enforces leaf and decorator arity', () => {
    const invalid: BehaviorGraph = {version: 1, rootId: 'root', nodes: [
      {id: 'root', kind: 'inverter', label: 'Not', children: [], position: {x: 0, y: 0}},
    ]};
    expect(validateGraph(invalid).issues.some(i => i.code === 'arity')).toBe(true);
    expect(() => serializeGraph(invalid)).toThrow(GraphValidationError);
  });

  it('rejects unknown task references instead of invoking inherited object methods', () => {
    const graph: BehaviorGraph = {version: 1, rootId: 'leaf', nodes: [
      {id: 'leaf', kind: 'action', label: 'Unsafe?', task: 'toString', children: [], position: {x: 0, y: 0}},
    ]};
    expect(() => compileGraph(graph, registry)).toThrow('Unknown action');
  });

  it('runs abort callbacks on displaced actions', () => {
    const graph = sampleGraph();
    const abort = vi.fn();
    const enhanced: BehaviorRegistry<Data> = {
      ...registry, actions: {...registry.actions, patrol: {run: ({blackboard}) => {blackboard.events.push('patrol'); return 'running';}, onAbort: abort}},
    };
    const memory = data();
    const agent = new Agent(compileGraph(graph, enhanced), memory);
    agent.tick(0.1);
    memory.hasTarget = true;
    agent.tick(0.1);
    expect(abort).toHaveBeenCalledTimes(1);
  });
});
