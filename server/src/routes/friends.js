import { Router } from 'express';
import { many, one, q, tx } from '../db.js';
import { ah, fail, notify, areFriends, isBlockedEither } from '../helpers.js';
import { withDefaults } from '../auth.js';
import { emit, isOnline } from '../realtime.js';

const r = Router();
const MUTUAL = (a, b) => `(SELECT count(*)::int FROM friendships x JOIN friendships y ON x.friend_id = y.friend_id
                          WHERE x.user_id = ${a} AND y.user_id = ${b})`;

r.get('/', ah(async (req, res) => {
  const friends = await many(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, u.last_active, u.birthday,
            (u.settings->>'show_active_status') IS DISTINCT FROM 'false' AS shows_active, ${MUTUAL('u.id', '$1')} AS mutual_count
     FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = $1 AND NOT u.deactivated
     ORDER BY u.first_name`, [req.uid]);
  res.json({
    friends: await Promise.all(friends.map(async ({ shows_active, ...f }) => ({
      ...f, online: shows_active && await isOnline(f.id), last_active: shows_active ? f.last_active : null,
    }))),
  });
}));

r.get('/requests', ah(async (req, res) => {
  const received = await many(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, fr.created_at, ${MUTUAL('u.id', '$1')} AS mutual_count
     FROM friend_requests fr JOIN users u ON u.id = fr.from_id WHERE fr.to_id = $1 AND NOT u.deactivated
     ORDER BY fr.created_at DESC`, [req.uid]);
  const sent = await many(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, fr.created_at, ${MUTUAL('u.id', '$1')} AS mutual_count
     FROM friend_requests fr JOIN users u ON u.id = fr.to_id WHERE fr.from_id = $1 ORDER BY fr.created_at DESC`, [req.uid]);
  res.json({ received, sent });
}));

r.get('/suggestions', ah(async (req, res) => {
  const people = await many(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, ${MUTUAL('u.id', '$1')} AS mutual_count
     FROM users u
     WHERE u.id <> $1 AND NOT u.deactivated
       AND NOT EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM friend_requests fr WHERE (fr.from_id = $1 AND fr.to_id = u.id) OR (fr.from_id = u.id AND fr.to_id = $1))
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
     ORDER BY mutual_count DESC, u.created_at DESC LIMIT 30`, [req.uid]);
  res.json({ people });
}));

async function makeFriends(a, b) {
  await tx(async (c) => {
    await c.query(`DELETE FROM friend_requests WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1)`, [a, b]);
    await c.query(`INSERT INTO friendships (user_id, friend_id) VALUES ($1,$2),($2,$1) ON CONFLICT DO NOTHING`, [a, b]);
  });
}

r.post('/request/:id', ah(async (req, res) => {
  const to = Number(req.params.id);
  if (to === req.uid) fail(400, 'You cannot add yourself');
  const target = await one(`SELECT id, settings FROM users WHERE id = $1 AND NOT deactivated`, [to]);
  if (!target) fail(404, 'User not found');
  if (await isBlockedEither(req.uid, to)) fail(403, 'You cannot send a request to this person');
  if (await areFriends(req.uid, to)) return res.json({ relation: 'friends' });
  // If they already asked us, accept instead.
  if (await one(`SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2`, [to, req.uid])) {
    await makeFriends(req.uid, to);
    await notify({ userId: to, actorId: req.uid, type: 'friend_accept' });
    return res.json({ relation: 'friends' });
  }
  if (withDefaults(target.settings).friend_requests_from === 'friends_of_friends') {
    const m = await one(`SELECT ${MUTUAL('$1', '$2')} AS c`, [req.uid, to]);
    if (!m.c) fail(403, 'This person only accepts friend requests from friends of friends');
  }
  await q(`INSERT INTO friend_requests (from_id, to_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.uid, to]);
  await notify({ userId: to, actorId: req.uid, type: 'friend_request' });
  await emit(to, 'friend_request', { from_id: req.uid });
  res.json({ relation: 'request_sent' });
}));

r.delete('/request/:id', ah(async (req, res) => {
  await q(`DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2`, [req.uid, req.params.id]);
  await q(`DELETE FROM notifications WHERE user_id = $2 AND actor_id = $1 AND type = 'friend_request'`, [req.uid, req.params.id]);
  res.json({ relation: 'none' });
}));

r.post('/accept/:id', ah(async (req, res) => {
  const from = Number(req.params.id);
  if (!(await one(`SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2`, [from, req.uid]))) fail(404, 'Request not found');
  await makeFriends(req.uid, from);
  await notify({ userId: from, actorId: req.uid, type: 'friend_accept' });
  res.json({ relation: 'friends' });
}));

r.post('/decline/:id', ah(async (req, res) => {
  await q(`DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2`, [req.params.id, req.uid]);
  res.json({ relation: 'none' });
}));

r.delete('/:id', ah(async (req, res) => {
  await q(`DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`, [req.uid, req.params.id]);
  res.json({ relation: 'none' });
}));

r.get('/blocked/list', ah(async (req, res) => {
  res.json({
    blocked: await many(
      `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, b.created_at
       FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`, [req.uid]),
  });
}));

r.post('/block/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.uid) fail(400, 'You cannot block yourself');
  await tx(async (c) => {
    await c.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.uid, id]);
    await c.query(`DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`, [req.uid, id]);
    await c.query(`DELETE FROM friend_requests WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1)`, [req.uid, id]);
  });
  res.json({ blocked: true });
}));

r.delete('/block/:id', ah(async (req, res) => {
  await q(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [req.uid, req.params.id]);
  res.json({ blocked: false });
}));

export default r;
