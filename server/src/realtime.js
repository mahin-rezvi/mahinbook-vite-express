import { WebSocketServer } from 'ws';
import { verifyToken, parseCookie, COOKIE } from './auth.js';
import { q, many, one } from './db.js';

const sockets = new Map(); // userId -> Set<ws>

export function isOnline(userId) {
  return sockets.has(Number(userId));
}

export function onlineIds() {
  return [...sockets.keys()];
}

export function emit(userIds, type, payload) {
  const msg = JSON.stringify({ type, payload });
  for (const id of [].concat(userIds)) {
    const set = sockets.get(Number(id));
    if (!set) continue;
    for (const ws of set) if (ws.readyState === 1) ws.send(msg);
  }
}

async function friendIds(uid) {
  return (await many(`SELECT friend_id FROM friendships WHERE user_id = $1`, [uid])).map((r) => r.friend_id);
}

async function broadcastPresence(uid, online) {
  const u = await one(`SELECT settings FROM users WHERE id = $1`, [uid]);
  if (u?.settings?.show_active_status === false) return;
  emit(await friendIds(uid), 'presence', { user_id: uid, online, last_active: new Date().toISOString() });
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const cookies = parseCookie(req.headers.cookie);
    const v = await verifyToken(cookies[COOKIE]);
    if (!v) return ws.close(4001, 'unauthorized');
    const uid = v.uid;
    const first = !sockets.has(uid);
    if (first) sockets.set(uid, new Set());
    sockets.get(uid).add(ws);
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    if (first) broadcastPresence(uid, true).catch(() => {});

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'typing' && msg.conversation_id) {
        const members = await many(
          `SELECT user_id FROM conversation_members WHERE conversation_id = $1`, [msg.conversation_id]);
        if (!members.some((m) => m.user_id === uid)) return;
        emit(members.map((m) => m.user_id).filter((id) => id !== uid), 'typing', {
          conversation_id: msg.conversation_id, user_id: uid, typing: !!msg.typing,
        });
      }
    });

    ws.on('close', async () => {
      const set = sockets.get(uid);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) {
        sockets.delete(uid);
        await q(`UPDATE users SET last_active = now() WHERE id = $1`, [uid]).catch(() => {});
        broadcastPresence(uid, false).catch(() => {});
      }
    });
  });

  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(interval));
}
