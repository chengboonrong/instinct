import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {validateRemoteFrame} from '@instinct/bridge';

const LIMIT = 160_000;
const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
function isLoopbackAddress(address = '') {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
function validOrigin(origin) {
  if (origin === undefined) return true; // CLI / test clients still need the token
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      url.username === '' && url.password === '' && url.pathname === '/' && !url.search && !url.hash;
  } catch {return false;}
}
function safeToken(input, actual) {
  if (typeof input !== 'string') return false;
  const a = Buffer.from(input), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
function send(socket, message) {
  if (socket.readyState !== 1) return;
  const data = JSON.stringify(message);
  if (data.length <= LIMIT) socket.send(data);
}

/**
 * Local-only, read-only development relay.
 * No HTTP endpoints, eval, editor-to-game RPC, file writes or network binding.
 */
export function createBridgeServer({port = 7331, token = randomBytes(24).toString('hex')} = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new RangeError('Invalid port');
  if (typeof token !== 'string' || token.length < 16 || token.length > 256) throw new Error('Invalid bridge token');
  const http = createServer((request, response) => {
    response.writeHead(404, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'});
    response.end('Not found');
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: LIMIT,
    // Refuse during the handshake, so a rejected client never gets a socket to abuse.
    verifyClient: ({origin, req}) => isLoopbackAddress(req.socket.remoteAddress) && validOrigin(origin),
  });
  const clients = new Map();
  const agents = new Map(); // agentId -> {owner, frame}
  const roster = () => [...agents.values()].map(({frame}) => ({id: frame.id, label: frame.label}));
  const viewers = () => [...clients.entries()].filter(([, client]) => client.role === 'studio');
  const notifyRoster = () => {
    const packet = {type: 'roster', agents: roster()};
    for (const [viewer] of viewers()) send(viewer, packet);
  };
  const ready = new Promise((resolve, reject) => {
    http.once('listening', () => {
      const addr = http.address();
      resolve({port: addr.port, url: 'ws://127.0.0.1:' + addr.port});
    });
    wss.on('error', reject); // ws re-emits http errors, and would throw with no listener.
  });
  wss.on('connection', ws => {
    const client = {role: null, selected: null};
    clients.set(ws, client);
    const authTimer = setTimeout(() => {if (!client.role) ws.close(1008, 'Authentication required');}, 5000);
    ws.on('message', (data, binary) => {
      if (binary) {ws.close(1003, 'Text only'); return;}
      let msg;
      try {msg = JSON.parse(data.toString());} catch {ws.close(1003, 'Invalid JSON'); return;}
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {ws.close(1003, 'Invalid message'); return;}
      if (client.role === null) {
        if (msg.type !== 'hello' || !['game','studio'].includes(msg.role) ||
            !safeToken(msg.token, token)) {
          ws.close(1008, 'Unauthorized'); return;
        }
        client.role = msg.role;
        clearTimeout(authTimer);
        send(ws, {type: 'welcome', role: client.role});
        if (client.role === 'studio') send(ws, {type: 'roster', agents: roster()});
        return;
      }
      if (client.role === 'studio') {
        if (msg.type !== 'select' || typeof msg.id !== 'string' || !AGENT_ID.test(msg.id)) {
          send(ws, {type: 'error', message: 'Read-only studio supports only select'}); return;
        }
        client.selected = msg.id;
        const stored = agents.get(msg.id);
        if (stored) send(ws, {type: 'frame', frame: stored.frame});
        return;
      }
      if (msg.type === 'remove' && typeof msg.id === 'string' && AGENT_ID.test(msg.id)) {
        if (agents.get(msg.id)?.owner === ws) {agents.delete(msg.id); notifyRoster();}
        return;
      }
      if (msg.type !== 'publish' || !validateRemoteFrame(msg.frame)) {
        send(ws, {type: 'error', message: 'Invalid publish frame'}); return;
      }
      const frame = msg.frame;
      const existing = agents.get(frame.id);
      if (existing && existing.owner !== ws) {
        send(ws, {type: 'error', message: 'Agent ID belongs to another game'}); return;
      }
      if (!existing && agents.size >= 64) {
        send(ws, {type: 'error', message: 'Agent limit reached'}); return;
      }
      agents.set(frame.id, {owner: ws, frame});
      if (!existing || existing.frame.label !== frame.label) notifyRoster();
      for (const [viewer, watcher] of viewers()) {
        if (watcher.selected === frame.id && viewer.bufferedAmount < LIMIT) {
          send(viewer, {type: 'frame', frame});
        }
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      clients.delete(ws);
      let removed = false;
      for (const [id, info] of agents) {
        if (info.owner === ws) {agents.delete(id); removed = true;}
      }
      if (removed) notifyRoster();
    });
    ws.on('error', () => {});
  });
  http.listen(port, '127.0.0.1');
  return {
    ready,
    close: () => new Promise((resolve, reject) => {
      for (const ws of wss.clients) ws.terminate();
      wss.close(error => {
        if (error) reject(error);
        else http.close(err => err ? reject(err) : resolve());
      });
    }),
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const token = process.env.INSTINCT_BRIDGE_TOKEN || randomBytes(24).toString('hex');
  const port = Number(process.env.INSTINCT_BRIDGE_PORT || 7331);
  const bridge = createBridgeServer({token, port});
  bridge.ready.then(({url}) => {
    console.log('Instinct development bridge:', url);
    console.log('Development token (copy into both game and Studio):', token);
    console.log('Loopback only. Never deploy this server publicly.');
  }).catch(error => {console.error(error); process.exitCode = 1;});
}
