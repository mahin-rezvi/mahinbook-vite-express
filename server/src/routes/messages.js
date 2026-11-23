import { Router } from 'express';
import { many, one, q, tx, userJson } from '../db.js';
import { ah, fail, upload, fileUrl, isBlockedEither } from '../helpers.js';
import { emit, isOnline } from '../realtime.js';

const r = Router();

async function memberIds(convId) {
  return (await many(`SELECT user_id FROM conversation_members WHERE conversation_id = $1`, [convId])).map((m) => m.user_id);
}

async function mustBeMember(uid, convId) {
  const m = await one(`SELECT * FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [convId, uid]);
  if (!m) fail(404, 'Conversation not found');
  return m;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id, m.sender_id, m.kind, m.created_at, m.deleted, m.edited,
         CASE WHEN m.deleted THEN NULL ELSE m.content END AS content,
         CASE WHEN m.deleted THEN NULL ELSE m.image_url END AS image_url,
         m.reply_to_id,
         CASE WHEN rm.id IS NOT NULL THEN json_build_object('id', rm.id, 'sender_id', rm.sender_id,
              'content', CASE WHEN rm.deleted THEN NULL ELSE rm.content END, 'image_url', CASE WHEN rm.deleted THEN NULL ELSE rm.image_url END) END AS reply_to,
         COALESCE((SELECT json_agg(json_build_object('user_id', mr.user_id, 'emoji', mr.emoji)) FROM message_reactions mr WHERE mr.message_id = m.id), '[]') AS reactions
  FROM messages m LEFT JOIN messages rm ON rm.id = m.reply_to_id`;

async function conversationsFor(uid, convIds) {
  if (!convIds.length) return [];
  const rows = await many(
    `SELECT c.id, c.is_group, c.title, c.image_url, c.emoji, c.color, c.created_by, c.updated_at,
            cm.muted, cm.archived, cm.last_read_id,
            (SELECT json_agg(json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name,
                    'username', u.username, 'avatar_url', u.avatar_url, 'last_active', u.last_active,
                    'shows_active', (u.settings->>'show_active_status') IS DISTINCT FROM 'false',
                    'read_receipts', (u.settings->>'read_receipts') IS DISTINCT FROM 'false',
                    'nickname', m2.nickname, 'last_read_id', m2.last_read_id) ORDER BY u.id)
             FROM conversation_members m2 JOIN users u ON u.id = m2.user_id WHERE m2.conversation_id = c.id) AS members,
            (SELECT row_to_json(lm) FROM (${MESSAGE_SELECT} WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) lm) AS last_message,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.id > cm.last_read_id AND m.sender_id <> $1) AS unread
     FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
     WHERE c.id = ANY($2::int[])
     ORDER BY c.updated_at DESC`, [uid, convIds.map(Number)]);
  return Promise.all(rows.map(async (c) => {
    const meReceipts = c.members.find((m) => m.id === uid)?.read_receipts !== false;
    c.members = await Promise.all(c.members.map(async ({ shows_active, read_receipts, ...m }) => ({
      ...m,
      online: shows_active && await isOnline(m.id),
      last_active: shows_active ? m.last_active : null,
      // Read receipts are reciprocal: hide others' receipts if I turned mine off, and theirs if they did.
      last_read_id: m.id === uid || (meReceipts && read_receipts) ? m.last_read_id : null,
    })));
    return c;
  }));
}

async function conversationFor(uid, convId) {
  return (await conversationsFor(uid, [convId]))[0] || null;
}

r.get('/', ah(async (req, res) => {
  const ids = await many(
    `SELECT c.id FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE cm.user_id = $1 AND cm.archived = $2
       AND (c.is_group OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id))
     ORDER BY c.updated_at DESC LIMIT 100`, [req.uid, req.query.archived === '1']);
  res.json({ conversations: await conversationsFor(req.uid, ids.map((r0) => r0.id)) });
}));

// Find or create a 1:1 conversation, or create a group chat.
r.post('/', ah(async (req, res) => {
  const userIds = [...new Set((req.body.user_ids || []).map(Number).filter((id) => id && id !== req.uid))];
  if (!userIds.length) fail(400, 'Choose at least one person');
  for (const id of userIds) if (await isBlockedEither(req.uid, id)) fail(403, 'You can\'t message this person');
  if (userIds.length === 1 && !req.body.title) {
    const existing = await one(
      `SELECT c.id FROM conversations c
       WHERE NOT c.is_group
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $1)
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = $2)`, [req.uid, userIds[0]]);
    if (existing) {
      await q(`UPDATE conversation_members SET archived = FALSE WHERE conversation_id = $1 AND user_id = $2`, [existing.id, req.uid]);
      return res.json(await conversationFor(req.uid, existing.id));
    }
  }
  const isGroup = userIds.length > 1 || !!req.body.title;
  const id = await tx(async (c) => {
    const conv = await c.query(`INSERT INTO conversations (is_group, title, created_by) VALUES ($1,$2,$3) RETURNING id`,
      [isGroup, req.body.title || null, req.uid]);
    for (const u of [req.uid, ...userIds])
      await c.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2)`, [conv.rows[0].id, u]);
    if (isGroup)
      await c.query(`INSERT INTO messages (conversation_id, sender_id, kind, content) VALUES ($1,$2,'system','created the group')`,
        [conv.rows[0].id, req.uid]);
    return conv.rows[0].id;
  });
  if (isGroup) for (const u of userIds) await emit(u, 'conversation', await conversationFor(u, id));
  res.status(201).json(await conversationFor(req.uid, id));
}));

r.get('/:id', ah(async (req, res) => {
  await mustBeMember(req.uid, req.params.id);
  res.json(await conversationFor(req.uid, req.params.id));
}));

r.patch('/:id', ah(async (req, res) => {
  const convId = Number(req.params.id);
  await mustBeMember(req.uid, convId);
  const { title, emoji, color, muted, archived, nickname_for, nickname } = req.body;
  if (title !== undefined || emoji !== undefined || color !== undefined) {
    await q(`UPDATE conversations SET title = COALESCE($2, title), emoji = COALESCE($3, emoji), color = COALESCE($4, color)
             WHERE id = $1`, [convId, title ?? null, emoji ?? null, color ?? null]);
    const what = title !== undefined ? `named the group ${title}` : emoji !== undefined ? `set the quick reaction to ${emoji}` : 'changed the theme';
    await postSystem(req.uid, convId, what);
  }
  if (muted !== undefined) await q(`UPDATE conversation_members SET muted = $3 WHERE conversation_id=$1 AND user_id=$2`, [convId, req.uid, !!muted]);
  if (archived !== undefined) await q(`UPDATE conversation_members SET archived = $3 WHERE conversation_id=$1 AND user_id=$2`, [convId, req.uid, !!archived]);
  if (nickname_for) {
    await q(`UPDATE conversation_members SET nickname = NULLIF($3, '') WHERE conversation_id=$1 AND user_id=$2`, [convId, nickname_for, nickname || '']);
    await postSystem(req.uid, convId, nickname ? `set a nickname: ${nickname}` : 'cleared a nickname');
  }
  const updated = await conversationFor(req.uid, convId);
  for (const u of await memberIds(convId)) await emit(u, 'conversation', await conversationFor(u, convId));
  res.json(updated);
}));

async function postSystem(uid, convId, text) {
  const m = await one(`INSERT INTO messages (conversation_id, sender_id, kind, content) VALUES ($1,$2,'system',$3) RETURNING id`,
    [convId, uid, text]);
  await q(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [convId]);
  const full = await one(`${MESSAGE_SELECT} WHERE m.id = $1`, [m.id]);
  await emit(await memberIds(convId), 'message', full);
}

r.post('/:id/members', ah(async (req, res) => {
  const convId = Number(req.params.id);
  await mustBeMember(req.uid, convId);
  const conv = await one(`SELECT is_group FROM conversations WHERE id = $1`, [convId]);
  if (!conv.is_group) fail(400, 'Start a new group to add people');
  for (const id of (req.body.user_ids || []).map(Number)) {
    await q(`INSERT INTO conversation_members (conversation_id, user_id, last_read_id) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`, [convId, id]);
    const u = await one(`SELECT first_name, last_name FROM users WHERE id = $1`, [id]);
    await postSystem(req.uid, convId, `added ${u.first_name} ${u.last_name}`);
  }
  res.json(await conversationFor(req.uid, convId));
}));

r.delete('/:id/members/:userId', ah(async (req, res) => {
  const convId = Number(req.params.id);
  const target = req.params.userId === 'me' ? req.uid : Number(req.params.userId);
  await mustBeMember(req.uid, convId);
  const conv = await one(`SELECT is_group, created_by FROM conversations WHERE id = $1`, [convId]);
  if (!conv.is_group) fail(400, 'Not a group conversation');
  if (target !== req.uid && conv.created_by !== req.uid) fail(403, 'Only the group creator can remove people');
  const u = await one(`SELECT first_name, last_name FROM users WHERE id = $1`, [target]);
  await postSystem(req.uid, convId, target === req.uid ? 'left the group' : `removed ${u.first_name} ${u.last_name}`);
  await q(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [convId, target]);
  res.json({ ok: true });
}));

r.get('/:id/messages', ah(async (req, res) => {
  await mustBeMember(req.uid, req.params.id);
  const before = Number(req.query.before) || 2147483647;
  const rows = await many(`${MESSAGE_SELECT} WHERE m.conversation_id = $1 AND m.id < $2 ORDER BY m.id DESC LIMIT 40`,
    [req.params.id, before]);
  res.json({ messages: rows.reverse(), has_more: rows.length === 40 });
}));

r.get('/:id/media', ah(async (req, res) => {
  await mustBeMember(req.uid, req.params.id);
  res.json({ media: await many(`SELECT id, image_url FROM messages WHERE conversation_id = $1 AND image_url IS NOT NULL
                                AND NOT deleted ORDER BY id DESC LIMIT 60`, [req.params.id]) });
}));

r.post('/:id/messages', upload.single('file'), ah(async (req, res) => {
  const convId = Number(req.params.id);
  const content = (req.body.content || '').slice(0, 5000);
  if (!content.trim() && !req.file) fail(400, 'Empty message');
  // Membership, member list, and (for 1:1 chats) block status in one query.
  const info = await one(
    `SELECT c.is_group, array_agg(cm.user_id) AS members,
            bool_or(cm.user_id = $2) AS is_member,
            EXISTS (SELECT 1 FROM blocks b JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> $2
                    WHERE NOT c.is_group AND ((b.blocker_id = $2 AND b.blocked_id = o.user_id) OR (b.blocker_id = o.user_id AND b.blocked_id = $2))) AS blocked
     FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE c.id = $1 GROUP BY c.id`, [convId, req.uid]);
  if (!info?.is_member) fail(404, 'Conversation not found');
  if (info.blocked) fail(403, 'You can\'t reply to this conversation');
  const full = await one(
    `WITH ins AS (
       INSERT INTO messages (conversation_id, sender_id, content, image_url, reply_to_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id
     ),
     c AS (UPDATE conversations SET updated_at = now() WHERE id = $1),
     cm AS (UPDATE conversation_members SET archived = FALSE,
              last_read_id = CASE WHEN user_id = $2 THEN (SELECT id FROM ins) ELSE last_read_id END
            WHERE conversation_id = $1)
     SELECT id FROM ins`,
    [convId, req.uid, content, fileUrl(req.file), req.body.reply_to_id || null]);
  const msg = await one(
    `SELECT x.*, (SELECT ${userJson('u')} FROM users u WHERE u.id = x.sender_id) AS sender
     FROM (${MESSAGE_SELECT} WHERE m.id = $1) x`, [full.id]);
  await emit(info.members, 'message', msg);
  res.status(201).json(msg);
}));

r.post('/:id/read', ah(async (req, res) => {
  const convId = Number(req.params.id);
  await mustBeMember(req.uid, convId);
  const last = await one(`SELECT max(id) AS id FROM messages WHERE conversation_id = $1`, [convId]);
  await q(`UPDATE conversation_members SET last_read_id = GREATEST(last_read_id, $3) WHERE conversation_id = $1 AND user_id = $2`,
    [convId, req.uid, last.id || 0]);
  const me = await one(`SELECT settings FROM users WHERE id = $1`, [req.uid]);
  if (me.settings?.read_receipts !== false)
    await emit((await memberIds(convId)).filter((id) => id !== req.uid), 'read', { conversation_id: convId, user_id: req.uid, last_read_id: last.id || 0 });
  await emit(req.uid, 'read_self', { conversation_id: convId });
  res.json({ ok: true });
}));

r.delete('/:id', ah(async (req, res) => {
  // "Delete chat" removes it from your inbox only (others keep their copy).
  await q(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  await q(`DELETE FROM conversations c WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id)`, [req.params.id]);
  res.json({ ok: true });
}));

/* single-message operations */
export const messageRouter = Router();

async function ownMessage(uid, id) {
  const m = await one(`SELECT * FROM messages WHERE id = $1`, [id]);
  if (!m) fail(404, 'Message not found');
  await mustBeMember(uid, m.conversation_id);
  return m;
}

messageRouter.delete('/:id', ah(async (req, res) => {
  const m = await ownMessage(req.uid, req.params.id);
  if (m.sender_id !== req.uid) fail(403, 'You can only unsend your own messages');
  await q(`UPDATE messages SET deleted = TRUE WHERE id = $1`, [m.id]);
  await q(`DELETE FROM message_reactions WHERE message_id = $1`, [m.id]);
  await emit(await memberIds(m.conversation_id), 'message_update', await one(`${MESSAGE_SELECT} WHERE m.id = $1`, [m.id]));
  res.json({ ok: true });
}));

messageRouter.patch('/:id', ah(async (req, res) => {
  const m = await ownMessage(req.uid, req.params.id);
  if (m.sender_id !== req.uid || m.deleted || m.kind !== 'text') fail(403, 'You can only edit your own messages');
  if (Date.now() - new Date(m.created_at) > 15 * 60 * 1000) fail(400, 'Messages can only be edited within 15 minutes');
  await q(`UPDATE messages SET content = $2, edited = TRUE WHERE id = $1`, [m.id, req.body.content || '']);
  const full = await one(`${MESSAGE_SELECT} WHERE m.id = $1`, [m.id]);
  await emit(await memberIds(m.conversation_id), 'message_update', full);
  res.json(full);
}));

messageRouter.post('/:id/react', ah(async (req, res) => {
  const m = await ownMessage(req.uid, req.params.id);
  const existing = await one(`SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2`, [m.id, req.uid]);
  if (existing?.emoji === req.body.emoji) await q(`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`, [m.id, req.uid]);
  else await q(`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)
                ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji`, [m.id, req.uid, req.body.emoji || '❤️']);
  const full = await one(`${MESSAGE_SELECT} WHERE m.id = $1`, [m.id]);
  await emit(await memberIds(m.conversation_id), 'message_update', full);
  res.json(full);
}));

export default r;
