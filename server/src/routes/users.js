import { Router } from 'express';
import { many, one, q, tx } from '../db.js';
import { ah, fail, upload, fileUrl, fetchPosts, cursorWhere, nextCursor, isBlockedEither, areFriends, visibleTo, pick } from '../helpers.js';
import { withDefaults } from '../auth.js';
import { isOnline } from '../realtime.js';
import { loadMe } from './auth.js';

const r = Router();

async function resolveUser(viewer, idOrUsername) {
  const u = await one(
    `SELECT id, first_name, last_name, username, avatar_url, cover_url, bio, birthday, gender, city, hometown, work,
            education, relationship, website, settings, created_at, last_active, deactivated
     FROM users WHERE ${/^\d+$/.test(idOrUsername) ? 'id = $1::int' : 'username = $1'}`, [idOrUsername]);
  if (!u || (u.deactivated && u.id !== viewer)) fail(404, 'This content isn\'t available right now');
  if (u.id !== viewer && (await isBlockedEither(viewer, u.id))) {
    const iBlocked = await one(`SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [viewer, u.id]);
    if (!iBlocked) fail(404, 'This content isn\'t available right now');
    u.blocked_by_me = true;
  }
  return u;
}

async function canSeeFriendList(viewer, u) {
  if (viewer === u.id) return true;
  const vis = withDefaults(u.settings).friend_list_visibility;
  if (vis === 'public') return true;
  if (vis === 'friends') return areFriends(viewer, u.id);
  return false;
}

// Profile header + about
r.get('/:id', ah(async (req, res) => {
  const viewer = req.uid;
  const u = await resolveUser(viewer, req.params.id);
  const settings = withDefaults(u.settings);
  let relation = 'none';
  if (u.id === viewer) relation = 'self';
  else if (await areFriends(viewer, u.id)) relation = 'friends';
  else if (await one(`SELECT 1 FROM friend_requests WHERE from_id=$1 AND to_id=$2`, [viewer, u.id])) relation = 'request_sent';
  else if (await one(`SELECT 1 FROM friend_requests WHERE from_id=$1 AND to_id=$2`, [u.id, viewer])) relation = 'request_received';

  const counts = await one(
    `SELECT (SELECT count(*)::int FROM friendships WHERE user_id = $1) AS friend_count,
            (SELECT count(*)::int FROM friendships a JOIN friendships b ON a.friend_id = b.friend_id
               WHERE a.user_id = $1 AND b.user_id = $2) AS mutual_count`, [u.id, viewer]);
  const friendsPreview = (await canSeeFriendList(viewer, u))
    ? await many(`SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url FROM friendships f
                  JOIN users u ON u.id = f.friend_id WHERE f.user_id = $1 AND NOT u.deactivated ORDER BY random() LIMIT 9`, [u.id])
    : [];
  const showActive = settings.show_active_status;
  delete u.settings;
  res.json({
    ...u,
    ...counts,
    relation,
    friends_preview: friendsPreview,
    can_post_on_wall: relation === 'self' || (relation === 'friends' && settings.wall_posting === 'friends'),
    online: showActive ? isOnline(u.id) : false,
    last_active: showActive ? u.last_active : null,
  });
}));

const PROFILE_FIELDS = ['first_name', 'last_name', 'bio', 'birthday', 'gender', 'city', 'hometown', 'work',
  'education', 'relationship', 'website', 'phone'];

r.patch('/me/profile', ah(async (req, res) => {
  const data = pick(req.body || {}, PROFILE_FIELDS);
  if ('first_name' in data && !String(data.first_name).trim()) fail(400, 'First name cannot be empty');
  if ('last_name' in data && !String(data.last_name).trim()) fail(400, 'Last name cannot be empty');
  if (data.birthday === '') data.birthday = null;
  if ('bio' in data) data.bio = String(data.bio).slice(0, 101);
  const keys = Object.keys(data);
  if (keys.length) {
    await q(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [req.uid, ...keys.map((k) => data[k])]);
  }
  res.json(await loadMe(req.uid));
}));

// Upload profile picture or cover photo; also creates a timeline post like the real thing.
for (const kind of ['avatar', 'cover']) {
  r.post(`/me/${kind}`, upload.single('file'), ah(async (req, res) => {
    if (!req.file) fail(400, 'Please choose an image');
    const url = fileUrl(req.file);
    await tx(async (c) => {
      await c.query(`UPDATE users SET ${kind}_url = $2 WHERE id = $1`, [req.uid, url]);
      const p = await c.query(
        `INSERT INTO posts (author_id, content, privacy, feeling) VALUES ($1, $2, 'public', $3) RETURNING id`,
        [req.uid, req.body.caption || '', kind === 'avatar' ? 'updated their profile picture' : 'updated their cover photo']);
      await c.query(`INSERT INTO post_media (post_id, url) VALUES ($1, $2)`, [p.rows[0].id, url]);
    });
    res.json(await loadMe(req.uid));
  }));
  r.delete(`/me/${kind}`, ah(async (req, res) => {
    await q(`UPDATE users SET ${kind}_url = NULL WHERE id = $1`, [req.uid]);
    res.json(await loadMe(req.uid));
  }));
}

// Timeline posts: posts by the user (outside groups/pages) plus posts on their wall
r.get('/:id/posts', ah(async (req, res) => {
  const u = await resolveUser(req.uid, req.params.id);
  const limit = 10;
  const c = cursorWhere(req.query.before, 3);
  const rows = await fetchPosts(req.uid,
    `((p.author_id = $2 AND p.group_id IS NULL AND p.page_id IS NULL AND (p.wall_user_id IS NULL OR p.wall_user_id = $2))
       OR p.wall_user_id = $2) AND ${c.sql}`, [u.id, ...c.params], { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit) });
}));

r.get('/:id/friends', ah(async (req, res) => {
  const u = await resolveUser(req.uid, req.params.id);
  if (!(await canSeeFriendList(req.uid, u))) return res.json({ hidden: true, friends: [] });
  const friends = await many(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, u.city, u.work,
            (SELECT count(*)::int FROM friendships a JOIN friendships b ON a.friend_id = b.friend_id
               WHERE a.user_id = u.id AND b.user_id = $2) AS mutual_count,
            EXISTS (SELECT 1 FROM friendships x WHERE x.user_id = $2 AND x.friend_id = u.id) AS is_my_friend
     FROM friendships f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1 AND NOT u.deactivated
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2))
     ORDER BY u.first_name, u.last_name`, [u.id, req.uid]);
  res.json({ friends });
}));

r.get('/:id/photos', ah(async (req, res) => {
  const u = await resolveUser(req.uid, req.params.id);
  const photos = await many(
    `SELECT m.id, m.url, m.post_id FROM post_media m JOIN posts p ON p.id = m.post_id JOIN users au ON au.id = p.author_id
     WHERE p.author_id = $2 AND ${visibleTo('$1')} ORDER BY p.created_at DESC, m.position LIMIT 60`, [req.uid, u.id]);
  res.json({ photos });
}));

export default r;
