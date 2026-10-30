import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {once} from 'node:events';
import WebSocket from 'ws';
import {DevtoolsPublisher} from '@instinct/bridge';
import {sampleGraph} from '@instinct/definition';
import {createBridgeServer} from '../server.mjs';

const token = 'development-test-token-123456789';
let bridge;
let url;
const sockets = [];
function inbox(socket) {
  const queue = [];
  const pending = [];
  socket.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (pending.length) pending.shift()(msg);
    else queue.push(msg);
  });
  return {
    next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => pending.push(resolve)),
  };
}
async function client(role, valid = token, origin = 'http://localhost:5173') {
  const socket = new WebSocket(url, {origin});
  sockets.push(socket);
  const messages = inbox(socket);
  await once(socket, 'open');
  socket.send(JSON.stringify({type: 'hello', role, token: valid}));
  return {socket, messages};
}
const frame = {
  id: 'guard-1', label: 'Guard One', graph: sampleGraph(),
  trace: {tick: 1, nodeStatuses: {root: 'running'}, entries: [], blackboard: {health: '100'}},
};
beforeEach(async () => {
  bridge = createBridgeServer({port: 0, token});
  url = (await bridge.ready).url;
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await bridge.close();
});
describe('local authenticated bridge', () => {
  it('relays only selected agents and delivers cached latest frame', async () => {
    const game = await client('game');
    expect((await game.messages.next()).type).toBe('welcome');
    const studio = await client('studio');
    expect((await studio.messages.next()).type).toBe('welcome');
    expect(await studio.messages.next()).toEqual({type: 'roster', agents: []});
    game.socket.send(JSON.stringify({type: 'publish', frame}));
    expect(await studio.messages.next()).toEqual({type: 'roster', agents: [{id: 'guard-1', label: 'Guard One'}]});
    studio.socket.send(JSON.stringify({type: 'select', id: 'guard-1'}));
    expect(await studio.messages.next()).toEqual({type: 'frame', frame});
    game.socket.send(JSON.stringify({type: 'remove', id: 'guard-1'}));
    expect(await studio.messages.next()).toEqual({type: 'roster', agents: []});
  });
  it('rejects invalid auth and disallowed browser origins', async () => {
    const wrong = await client('studio', 'this-is-the-wrong-credential');
    const closed = once(wrong.socket, 'close');
    expect((await closed)[0]).toBe(1008);
    const evil = new WebSocket(url, {origin: 'https://attacker.example'});
    sockets.push(evil);
    const [refused] = await once(evil, 'error');
    expect(refused.message).toContain('401');
  });
  it('rejects ready instead of crashing when the port is taken', async () => {
    const clash = createBridgeServer({port: Number(new URL(url).port), token});
    await expect(clash.ready).rejects.toThrow('EADDRINUSE');
  });
  it('keeps a game connected when a multi-byte frame is over the byte limit', async () => {
    const studio = await client('studio');
    await studio.messages.next();
    await studio.messages.next();
    const game = new DevtoolsPublisher({token, url});
    game.connect();
    await vi.waitFor(() => expect(game.connected).toBe(true));
    const entry = {sequence: 1, tick: 1, kind: 'blackboard', key: 'k', previous: '界'.repeat(60_000), current: ''};
    game.publish({...frame, id: 'wide', trace: {...frame.trace, entries: [entry]}});
    game.publish({...frame, id: 'small'});
    expect(await studio.messages.next()).toEqual({type: 'roster', agents: [{id: 'small', label: 'Guard One'}]});
    game.close();
  });
  it('does not accept editor commands or another game taking an owned ID', async () => {
    const game = await client('game');
    await game.messages.next();
    const game2 = await client('game');
    await game2.messages.next();
    const studio = await client('studio');
    await studio.messages.next(); await studio.messages.next();
    game.socket.send(JSON.stringify({type: 'publish', frame}));
    await studio.messages.next();
    game2.socket.send(JSON.stringify({type: 'publish', frame}));
    expect((await game2.messages.next()).type).toBe('error');
    studio.socket.send(JSON.stringify({type: 'execute', command: 'attack'}));
    expect((await studio.messages.next()).type).toBe('error');
  });
});
