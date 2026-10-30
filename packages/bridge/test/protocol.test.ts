import {describe, expect, it} from 'vitest';
import {sampleGraph} from '@instinct/definition';
import {validateRemoteFrame, DevtoolsViewer, DevtoolsPublisher} from '../src/index.js';

const frame = () => ({
  id: 'guard_01', label: 'First Guard', graph: sampleGraph(),
  trace: {tick: 4, nodeStatuses: {root: 'running'}, entries: [], blackboard: {health: '80'}},
});
describe('development bridge protocol', () => {
  it('accepts bounded graph and trace payloads', () => {
    expect(validateRemoteFrame(frame())).toBe(true);
    expect(validateRemoteFrame({...frame(), trace: {...frame().trace, nodeStatuses: {root: 'invalid'}}})).toBe(false);
    expect(validateRemoteFrame({...frame(), id: '../unsafe'})).toBe(false);
    expect(validateRemoteFrame({...frame(), graph: {version: 1, rootId: 'bad', nodes: []}})).toBe(false);
    expect(validateRemoteFrame({...frame(), trace: {...frame().trace, entries: new Array(257).fill({})}})).toBe(false);
  });
  it('rejects nonlocal transports, short tokens and embedded credentials', () => {
    const token = '1234567890123456';
    expect(() => new DevtoolsViewer({token, url: 'wss://production.example/ws'})).toThrow('local');
    expect(() => new DevtoolsViewer({token, url: 'ws://example.com/'})).toThrow('local');
    expect(() => new DevtoolsPublisher({token, url: 'ws://localhost:7331/?token=x'})).toThrow('local');
    expect(() => new DevtoolsViewer({token: 'short'})).toThrow('16–256');
  });
});
