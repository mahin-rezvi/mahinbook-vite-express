import multer from 'multer';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { many, one, q, userJson } from './db.js';
import { emit } from './realtime.js';

export const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

const makeFilename = (file) => {
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  return crypto.randomBytes(12).toString('hex') + ext;
};

const databaseStorage = {
  _handleFile(_req, file, cb) {
    const filename = makeFilename(file);
    const chunks = [];
    let size = 0;
    file.stream.on('data', (chunk) => { chunks.push(chunk); size += chunk.length; });
    file.stream.once('error', cb);
    file.stream.once('end', () => {
      q(`INSERT INTO media_files (filename, content_type, data) VALUES ($1,$2,$3)`,
        [filename, file.mimetype, Buffer.concat(chunks, size)])
        .then(() => cb(null, { filename, size }))
        .catch(cb);
    });
  },
  _removeFile(_req, file, cb) {
    q(`DELETE FROM media_files WHERE filename = $1`, [file.filename]).then(() => cb(null), cb);
  },
};

const localStorage = process.env.MAHINBOOK_WORKER === '1' ? null : multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, makeFilename(file)),
});

export const upload = multer({
  storage: process.env.MAHINBOOK_WORKER === '1' ? databaseStorage : localStorage,
  limits: process.env.MAHINBOOK_WORKER === '1'
    ? { fileSize: 8 * 1024 * 1024, files: 5 }
    : { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});

export const fileUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// Wrap async route handlers so thrown errors reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export async function areFriends(a, b) {
  return !!(await one(`SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2`, [a, b]));
}

export async function isBlockedEither(a, b) {
  return !!(await one(
    `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, [a, b]));
}

const NOTIFY_PREF = {
  comment: 'comments', reply: 'comments', reaction: 'reactions', comment_like: 'reactions', share: 'reactions',
  friend_request: 'friend_requests', friend_accept: 'friend_requests',
  group_join_request: 'groups', group_approved: 'groups', group_invite: 'groups', group_post: 'groups',
  wall_post: 'tags', event_invite: 'groups', page_follow: 'reactions',
};

/** Insert a notification and push it over the socket. Silently skips self-notifications and muted types. */
export async function notify({ userId, actorId, type, postId = null, commentId = null, groupId = null, data = {} }) {
  if (!userId || userId === actorId) return;
  const pref = NOTIFY_PREF[type] || null;
  const collapse = type === 'reaction' || type === 'comment_like';
  // One round-trip: check the recipient's preference and blocks, collapse duplicate reaction
  // notifications, insert, and return the row shaped for the client.
  const full = await one(
    `WITH ok AS (
       SELECT 1 FROM users t
       WHERE t.id = $1
         AND ($8::text IS NULL OR COALESCE((t.settings->'notify'->>$8)::boolean, TRUE))
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = $1))
     ),
     del AS (
       DELETE FROM notifications WHERE $9 AND user_id = $1 AND actor_id = $2 AND type = $3
         AND post_id IS NOT DISTINCT FROM $4 AND comment_id IS NOT DISTINCT FROM $5 AND EXISTS (SELECT 1 FROM ok)
     ),
     n AS (
       INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id, group_id, data)
       SELECT $1, $2, $3, $4, $5, $6, $7 FROM ok RETURNING *
     )
     ${NOTIF_SELECT_FROM('n')}`,
    [userId, actorId, type, postId, commentId, groupId, data, pref, collapse]);
  if (full) await emit(userId, 'notification', full);
}

const NOTIF_SELECT_FROM = (source) => `
  SELECT n.id, n.type, n.post_id, n.comment_id, n.group_id, n.data, n.read, n.created_at,
         ${userJson('a')} AS actor, g.name AS group_name
  FROM ${source} n
  LEFT JOIN users a ON a.id = n.actor_id
  LEFT JOIN groups g ON g.id = n.group_id`;

export const NOTIF_SELECT = NOTIF_SELECT_FROM('notifications');

/**
 * SQL condition: may viewer ($V) see post p? Requires `p` (posts) and `au` (author users) in scope.
 * Pass the placeholder for the viewer id, e.g. '$1'.
 */
export function visibleTo(V) {
  return `(
    NOT au.deactivated
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${V} AND b.blocked_id = p.author_id)
                                              OR (b.blocker_id = p.author_id AND b.blocked_id = ${V}))
    AND (
      p.author_id = ${V}
      OR (p.group_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM groups g2 WHERE g2.id = p.group_id AND g2.privacy = 'public')
         OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = p.group_id AND gm.user_id = ${V} AND gm.status = 'member')))
      OR (p.group_id IS NULL AND (
            p.privacy = 'public'
         OR p.wall_user_id = ${V}
         OR (p.privacy = 'friends' AND EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ${V} AND f.friend_id = p.author_id))))
    ))`;
}

const POST_COLS = (V) => `
  p.id, p.content, p.feeling, p.location, p.bg, p.privacy, p.group_id, p.page_id, p.wall_user_id,
  p.shared_post_id, p.created_at, p.updated_at,
  ${userJson('au')} AS author,
  CASE WHEN p.wall_user_id IS NOT NULL THEN (SELECT ${userJson('wu')} FROM users wu WHERE wu.id = p.wall_user_id) END AS wall_user,
  CASE WHEN p.group_id IS NOT NULL THEN (SELECT json_build_object('id', g.id, 'name', g.name, 'privacy', g.privacy) FROM groups g WHERE g.id = p.group_id) END AS "group",
  CASE WHEN p.page_id IS NOT NULL THEN (SELECT json_build_object('id', pg.id, 'name', pg.name, 'avatar_url', pg.avatar_url) FROM pages pg WHERE pg.id = p.page_id) END AS page,
  COALESCE((SELECT json_agg(json_build_object('id', m.id, 'url', m.url) ORDER BY m.position) FROM post_media m WHERE m.post_id = p.id), '[]') AS media,
  COALESCE((SELECT json_object_agg(t.type, t.c) FROM (SELECT type, count(*)::int c FROM reactions r WHERE r.post_id = p.id GROUP BY type) t), '{}') AS reaction_counts,
  (SELECT type FROM reactions r WHERE r.post_id = p.id AND r.user_id = ${V}) AS my_reaction,
  (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count,
  (SELECT count(*)::int FROM posts s WHERE s.shared_post_id = p.id) AS share_count,
  EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = ${V}) AS saved,
  (SELECT json_agg(${userJson('ru')}) FROM (SELECT ru.* FROM reactions r JOIN users ru ON ru.id = r.user_id
     WHERE r.post_id = p.id ORDER BY (r.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ${V})) DESC, r.created_at DESC LIMIT 3) ru) AS top_reactors`;

/**
 * Fetch posts visible to `viewer` matching an extra WHERE fragment.
 * `where` may reference params starting at $2 ($1 is always the viewer).
 */
export async function fetchPosts(viewer, where = 'TRUE', params = [], { limit = 10, order = 'p.created_at DESC' } = {}) {
  const rows = await many(
    `SELECT ${POST_COLS('$1')}
     FROM posts p JOIN users au ON au.id = p.author_id
     WHERE ${visibleTo('$1')} AND (${where})
     ORDER BY ${order}
     LIMIT ${Number(limit) | 0}`,
    [viewer, ...params]);
  await attachShared(viewer, rows);
  return rows;
}

async function attachShared(viewer, rows) {
  const ids = [...new Set(rows.map((r) => r.shared_post_id).filter(Boolean))];
  if (!ids.length) return;
  const shared = await many(
    `SELECT ${POST_COLS('$1')} FROM posts p JOIN users au ON au.id = p.author_id
     WHERE ${visibleTo('$1')} AND p.id = ANY($2::int[])`, [viewer, ids]);
  const byId = Object.fromEntries(shared.map((s) => [s.id, s]));
  for (const r of rows) if (r.shared_post_id) r.shared_post = byId[r.shared_post_id] || { unavailable: true };
}

export async function getPost(viewer, id) {
  const [p] = await fetchPosts(viewer, 'p.id = $2', [id], { limit: 1 });
  return p || null;
}

/** Cursor pagination helper: `before` is an ISO timestamp + id pair "ts|id". */
export function cursorWhere(before, nextParamIndex) {
  if (!before) return { sql: 'TRUE', params: [] };
  const [ts, id] = String(before).split('|');
  return {
    sql: `(p.created_at, p.id) < ($${nextParamIndex}::timestamptz, $${nextParamIndex + 1}::int)`,
    params: [ts, Number(id) || 0],
  };
}

export const nextCursor = (rows, limit) =>
  rows.length === limit ? `${new Date(rows.at(-1).created_at).toISOString()}|${rows.at(-1).id}` : null;

export async function friendIds(uid) {
  return (await many(`SELECT friend_id FROM friendships WHERE user_id = $1`, [uid])).map((r) => r.friend_id);
}

export function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
}
