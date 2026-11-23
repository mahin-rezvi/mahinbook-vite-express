import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { DurableObject } from 'cloudflare:workers';

let bootstrapPromise;

function configureProcess(env) {
  process.env.MAHINBOOK_WORKER = '1';
  process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
  process.env.JWT_SECRET = env.JWT_SECRET;
  process.env.CLIENT_ORIGIN = env.CLIENT_ORIGIN || 'https://mahinbook.pages.dev';
  process.env.PG_POOL_MAX = '5';
}

async function bootstrap(env) {
  configureProcess(env);
  const [{ default: app }, { configureRealtime }] = await Promise.all([
    import('../../server/src/app.js'),
    import('../../server/src/realtime.js'),
  ]);
  const chat = env.CHAT_HUB.get(env.CHAT_HUB.idFromName('mahinbook-global'));
  configureRealtime({
    emit: (userIds, type, payload) => chat.broadcast(userIds, type, payload),
    isOnline: (userId) => chat.isOnline(userId),
  });
  const server = createServer(app);
  server.listen(8787);
  return httpServerHandler({ port: 8787 });
}

export default {
  async fetch(request, env, ctx) {
    configureProcess(env);
    if (!bootstrapPromise) bootstrapPromise = bootstrap(env);
    const handler = await bootstrapPromise;
    if (new URL(request.url).pathname === '/ws') {
      const chat = env.CHAT_HUB.get(env.CHAT_HUB.idFromName('mahinbook-global'));
      return chat.fetch(request);
    }
    return handler.fetch(request, env, ctx);
  },
};

export class ChatHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.modulesPromise = null;
    this.environment = env;
  }

  async modules() {
    if (!this.modulesPromise) {
      configureProcess(this.environment);
      this.modulesPromise = Promise.all([
        import('../../server/src/auth.js'),
        import('../../server/src/db.js'),
      ]);
    }
    const [auth, db] = await this.modulesPromise;
    return { auth, db };
  }

  async fetch(request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket upgrade required', { status: 426 });

    const { auth } = await this.modules();
    const cookies = auth.parseCookie(request.headers.get('cookie') || '');
    const user = await auth.verifyToken(cookies[auth.COOKIE]);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const tag = String(user.uid);
    const firstSocket = this.ctx.getWebSockets(tag).length === 0;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ uid: user.uid });
    this.ctx.acceptWebSocket(server, [tag]);
    if (firstSocket) this.broadcastPresence(user.uid, true).catch((error) => console.error(error));
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(userIds, type, payload) {
    const message = JSON.stringify({ type, payload });
    for (const id of new Set([].concat(userIds).map(Number))) {
      for (const socket of this.ctx.getWebSockets(String(id))) {
        try { socket.send(message); } catch { /* A closed socket is removed by the runtime. */ }
      }
    }
  }

  async isOnline(userId) {
    return this.ctx.getWebSockets(String(Number(userId))).length > 0;
  }

  async webSocketMessage(socket, message) {
    let input;
    try { input = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return; }
    if (input.type !== 'typing' || !input.conversation_id) return;

    const { db } = await this.modules();
    const uid = socket.deserializeAttachment()?.uid;
    const members = await db.many(
      `SELECT user_id FROM conversation_members WHERE conversation_id = $1`, [input.conversation_id]);
    if (!members.some((member) => member.user_id === uid)) return;
    await this.broadcast(members.map((member) => member.user_id).filter((id) => id !== uid), 'typing', {
      conversation_id: input.conversation_id, user_id: uid, typing: !!input.typing,
    });
  }

  async webSocketClose(socket) {
    const uid = socket.deserializeAttachment()?.uid;
    if (!uid || this.ctx.getWebSockets(String(uid)).length > 1) return;
    const { db } = await this.modules();
    await db.q(`UPDATE users SET last_active = now() WHERE id = $1`, [uid]).catch(() => {});
    await this.broadcastPresence(uid, false).catch((error) => console.error(error));
  }

  async broadcastPresence(uid, online) {
    const { db } = await this.modules();
    const user = await db.one(`SELECT settings FROM users WHERE id = $1`, [uid]);
    if (user?.settings?.show_active_status === false) return;
    const friends = await db.many(`SELECT friend_id FROM friendships WHERE user_id = $1`, [uid]);
    await this.broadcast(friends.map((friend) => friend.friend_id), 'presence', {
      user_id: uid, online, last_active: new Date().toISOString(),
    });
  }
}
