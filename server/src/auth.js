import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { one, q } from './db.js';

const SECRET = process.env.JWT_SECRET;
export const COOKIE = 'mb_token';
const MAX_AGE = 30 * 24 * 3600 * 1000;

export const DEFAULT_SETTINGS = {
  default_audience: 'friends',          // public | friends | only_me
  friend_requests_from: 'everyone',     // everyone | friends_of_friends
  friend_list_visibility: 'public',     // public | friends | only_me
  lookup_by_email: 'everyone',          // everyone | friends | only_me
  wall_posting: 'friends',              // friends | only_me
  show_active_status: true,
  read_receipts: true,
  theme: 'light',                       // light | dark | system
  notify: { comments: true, reactions: true, friend_requests: true, groups: true, messages_sound: true, tags: true },
};

export function withDefaults(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...settings, notify: { ...DEFAULT_SETTINGS.notify, ...(settings.notify || {}) } };
}

export async function issueSession(res, req, userId) {
  const sid = crypto.randomBytes(18).toString('hex');
  await q(`INSERT INTO sessions (id, user_id, user_agent, ip) VALUES ($1,$2,$3,$4)`, [
    sid, userId, (req.headers['user-agent'] || '').slice(0, 300), req.ip,
  ]);
  const token = jwt.sign({ uid: userId, sid }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE, secure: process.env.NODE_ENV === 'production' });
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { uid, sid } = jwt.verify(token, SECRET);
    // Sessions cascade-delete with their user, so one round-trip validates both.
    // last_seen is only bumped once a minute to avoid a write on every request.
    const s = await one(
      `WITH s AS (SELECT id, last_seen FROM sessions WHERE id = $1 AND user_id = $2),
            u AS (UPDATE sessions SET last_seen = now() WHERE id = $1 AND last_seen < now() - interval '1 minute')
       SELECT id FROM s`, [sid, uid]);
    if (!s) return null;
    return { uid, sid };
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const v = await verifyToken(req.cookies?.[COOKIE]);
  if (!v) return res.status(401).json({ error: 'Not authenticated' });
  req.uid = v.uid;
  req.sid = v.sid;
  next();
}

export function parseCookie(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=').map(decodeURIComponent)).filter((p) => p[0]));
}
