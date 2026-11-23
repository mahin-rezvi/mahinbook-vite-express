import { Router } from 'express';
import { one, q } from '../db.js';
import { ah, fail } from '../helpers.js';
import { issueSession, requireAuth, COOKIE, withDefaults } from '../auth.js';

const r = Router();

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

async function uniqueUsername(first, last) {
  const base = `${slug(first)}.${slug(last)}`;
  for (let i = 0; i < 20; i++) {
    const cand = i === 0 ? base : `${base}.${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!(await one(`SELECT 1 FROM users WHERE username = $1`, [cand]))) return cand;
  }
  return `${base}.${Date.now()}`;
}

export async function loadMe(uid) {
  const u = await one(
    `SELECT id, first_name, last_name, username, email, phone, avatar_url, cover_url, bio, birthday, gender, city,
            hometown, work, education, relationship, website, settings, created_at,
            (SELECT count(*)::int FROM notifications WHERE user_id = $1 AND NOT read) AS unread_notifications,
            (SELECT count(*)::int FROM friend_requests WHERE to_id = $1) AS pending_requests,
            (SELECT count(*)::int FROM conversation_members cm WHERE cm.user_id = $1 AND NOT cm.archived AND EXISTS (
               SELECT 1 FROM messages m WHERE m.conversation_id = cm.conversation_id AND m.id > cm.last_read_id
               AND m.sender_id <> $1)) AS unread_conversations
     FROM users WHERE id = $1`, [uid]);
  if (u) u.settings = withDefaults(u.settings);
  return u;
}

r.post('/signup', ah(async (req, res) => {
  const { first_name, last_name, email, password, birthday, gender } = req.body || {};
  if (!first_name?.trim() || !last_name?.trim()) fail(400, 'First and last name are required');
  if (!/^\S+@\S+\.\S+$/.test(email || '')) fail(400, 'Please enter a valid email address');
  if ((password || '').length < 6) fail(400, 'Password must be at least 6 characters');
  if (await one(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [email])) fail(409, 'An account with this email already exists');
  const username = await uniqueUsername(first_name, last_name);
  const u = await one(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, birthday, gender)
     VALUES ($1,$2,$3,lower($4),crypt($5, gen_salt('bf', 10)),$6,$7) RETURNING id`,
    [first_name.trim(), last_name.trim(), username, email.trim(), password, birthday || null, gender || null]);
  await issueSession(res, req, u.id);
  res.status(201).json(await loadMe(u.id));
}));

r.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await one(
    `SELECT id, deactivated,
            replace(password_hash, '$2b$', '$2a$') =
              crypt($2, replace(password_hash, '$2b$', '$2a$')) AS password_valid
     FROM users WHERE lower(email) = lower($1) OR username = $1`, [email || '', password || '']);
  if (!u || !u.password_valid) fail(401, 'The email or password you entered is incorrect');
  if (u.deactivated) await q(`UPDATE users SET deactivated = FALSE WHERE id = $1`, [u.id]); // logging in reactivates
  await issueSession(res, req, u.id);
  res.json(await loadMe(u.id));
}));

r.post('/logout', requireAuth, ah(async (req, res) => {
  await q(`DELETE FROM sessions WHERE id = $1`, [req.sid]);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  res.json(await loadMe(req.uid));
}));

export default r;
