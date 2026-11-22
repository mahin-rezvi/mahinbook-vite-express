import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { many, one, q } from '../db.js';
import { ah, fail } from '../helpers.js';
import { withDefaults, DEFAULT_SETTINGS, COOKIE } from '../auth.js';
import { loadMe } from './auth.js';

const r = Router();

async function checkPassword(uid, password) {
  const u = await one(`SELECT password_hash FROM users WHERE id = $1`, [uid]);
  if (!(await bcrypt.compare(password || '', u.password_hash))) fail(400, 'The password you entered is incorrect');
}

const ENUMS = {
  default_audience: ['public', 'friends', 'only_me'],
  friend_requests_from: ['everyone', 'friends_of_friends'],
  friend_list_visibility: ['public', 'friends', 'only_me'],
  lookup_by_email: ['everyone', 'friends', 'only_me'],
  wall_posting: ['friends', 'only_me'],
  theme: ['light', 'dark', 'system'],
};

r.patch('/', ah(async (req, res) => {
  const cur = withDefaults((await one(`SELECT settings FROM users WHERE id = $1`, [req.uid])).settings);
  const next = { ...cur };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    if (ENUMS[k] && !ENUMS[k].includes(v)) fail(400, `Invalid value for ${k}`);
    if (k === 'notify') next.notify = { ...cur.notify, ...Object.fromEntries(Object.entries(v).map(([a, b]) => [a, !!b])) };
    else if (typeof DEFAULT_SETTINGS[k] === 'boolean') next[k] = !!v;
    else next[k] = v;
  }
  await q(`UPDATE users SET settings = $2 WHERE id = $1`, [req.uid, next]);
  res.json(await loadMe(req.uid));
}));

r.patch('/account', ah(async (req, res) => {
  const { username, email, phone, password } = req.body;
  if (email !== undefined || username !== undefined) await checkPassword(req.uid, password);
  if (username !== undefined) {
    if (!/^[a-z0-9.]{5,30}$/.test(username)) fail(400, 'Usernames must be 5-30 characters: lowercase letters, numbers and periods');
    if (await one(`SELECT 1 FROM users WHERE username = $1 AND id <> $2`, [username, req.uid])) fail(409, 'That username isn\'t available');
    await q(`UPDATE users SET username = $2 WHERE id = $1`, [req.uid, username]);
  }
  if (email !== undefined) {
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Enter a valid email');
    if (await one(`SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2`, [email, req.uid])) fail(409, 'That email is already in use');
    await q(`UPDATE users SET email = lower($2) WHERE id = $1`, [req.uid, email]);
  }
  if (phone !== undefined) await q(`UPDATE users SET phone = $2 WHERE id = $1`, [req.uid, phone]);
  res.json(await loadMe(req.uid));
}));

r.post('/password', ah(async (req, res) => {
  const { current, next, logout_others } = req.body;
  await checkPassword(req.uid, current);
  if ((next || '').length < 6) fail(400, 'Your new password must be at least 6 characters');
  await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [req.uid, await bcrypt.hash(next, 10)]);
  if (logout_others) await q(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [req.uid, req.sid]);
  res.json({ ok: true });
}));

r.get('/sessions', ah(async (req, res) => {
  const rows = await many(`SELECT id, user_agent, ip, created_at, last_seen FROM sessions WHERE user_id = $1 ORDER BY last_seen DESC`, [req.uid]);
  res.json({ sessions: rows.map((s) => ({ ...s, current: s.id === req.sid })) });
}));

r.delete('/sessions/:id', ah(async (req, res) => {
  if (req.params.id === 'others') await q(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [req.uid, req.sid]);
  else await q(`DELETE FROM sessions WHERE user_id = $1 AND id = $2`, [req.uid, req.params.id]);
  res.json({ ok: true });
}));

r.get('/activity', ah(async (req, res) => {
  const items = await many(
    `(SELECT 'post' AS kind, p.id AS post_id, p.content AS text, p.created_at, NULL AS extra FROM posts p WHERE p.author_id = $1)
     UNION ALL
     (SELECT 'comment', c.post_id, c.content, c.created_at, NULL FROM comments c WHERE c.user_id = $1)
     UNION ALL
     (SELECT 'reaction', r.post_id, NULL, r.created_at, r.type FROM reactions r WHERE r.user_id = $1)
     UNION ALL
     (SELECT 'friend', NULL, u.first_name || ' ' || u.last_name, f.created_at, NULL FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = $1)
     ORDER BY created_at DESC LIMIT 100`, [req.uid]);
  res.json({ items });
}));

// "Download your information"
r.get('/export', ah(async (req, res) => {
  const uid = req.uid;
  const data = {
    profile: await loadMe(uid),
    posts: await many(`SELECT id, content, privacy, feeling, location, created_at,
                         (SELECT json_agg(url) FROM post_media WHERE post_id = posts.id) AS media FROM posts WHERE author_id = $1 ORDER BY created_at`, [uid]),
    comments: await many(`SELECT post_id, content, created_at FROM comments WHERE user_id = $1 ORDER BY created_at`, [uid]),
    reactions: await many(`SELECT post_id, type, created_at FROM reactions WHERE user_id = $1`, [uid]),
    friends: await many(`SELECT u.first_name, u.last_name, u.username, f.created_at FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = $1`, [uid]),
    messages: await many(`SELECT conversation_id, content, image_url, created_at FROM messages WHERE sender_id = $1 AND NOT deleted ORDER BY created_at`, [uid]),
    groups: await many(`SELECT g.name, m.role, m.joined_at FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = $1`, [uid]),
    saved: await many(`SELECT post_id, created_at FROM saved_posts WHERE user_id = $1`, [uid]),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="mahinbook-data.json"');
  res.json(data);
}));

r.post('/deactivate', ah(async (req, res) => {
  await checkPassword(req.uid, req.body.password);
  await q(`UPDATE users SET deactivated = TRUE WHERE id = $1`, [req.uid]);
  await q(`DELETE FROM sessions WHERE user_id = $1`, [req.uid]);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}));

r.post('/delete-account', ah(async (req, res) => {
  await checkPassword(req.uid, req.body.password);
  await q(`DELETE FROM users WHERE id = $1`, [req.uid]);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}));

export default r;
