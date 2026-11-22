import { Router } from 'express';
import { many, one, q, tx, userJson } from '../db.js';
import { ah, fail, upload, fileUrl, fetchPosts, cursorWhere, nextCursor, notify } from '../helpers.js';

const r = Router();

const GROUP_COLS = `g.id, g.name, g.description, g.privacy, g.cover_url, g.created_at, g.created_by,
  (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id AND m.status = 'member') AS member_count,
  (SELECT role FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1 AND m.status = 'member') AS my_role,
  (SELECT status FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1) AS my_status`;

async function role(uid, gid) {
  return (await one(`SELECT role, status FROM group_members WHERE group_id = $1 AND user_id = $2`, [gid, uid])) || {};
}
async function mustAdmin(uid, gid) {
  const r0 = await role(uid, gid);
  if (r0.role !== 'admin' || r0.status !== 'member') fail(403, 'Only group admins can do that');
}

r.get('/', ah(async (req, res) => {
  const mine = await many(
    `SELECT ${GROUP_COLS} FROM groups g WHERE EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1 AND m.status = 'member')
     ORDER BY g.name`, [req.uid]);
  const discover = await many(
    `SELECT ${GROUP_COLS},
       (SELECT count(*)::int FROM group_members m JOIN friendships f ON f.friend_id = m.user_id AND f.user_id = $1
         WHERE m.group_id = g.id AND m.status = 'member') AS friends_in_group
     FROM groups g WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1 AND m.status = 'member')
     ORDER BY friends_in_group DESC, member_count DESC LIMIT 30`, [req.uid]);
  res.json({ mine, discover });
}));

// Posts from all my groups (the "Your feed" tab of Groups)
r.get('/feed', ah(async (req, res) => {
  const limit = 10;
  const c = cursorWhere(req.query.before, 2);
  const rows = await fetchPosts(req.uid,
    `p.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1 AND status = 'member') AND ${c.sql}`, c.params, { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit) });
}));

r.post('/', upload.single('cover'), ah(async (req, res) => {
  const { name, description = '', privacy = 'public' } = req.body;
  if (!name?.trim()) fail(400, 'Name your group');
  const id = await tx(async (c) => {
    const g = await c.query(`INSERT INTO groups (name, description, privacy, cover_url, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name.trim(), description, privacy === 'private' ? 'private' : 'public', fileUrl(req.file), req.uid]);
    await c.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'admin')`, [g.rows[0].id, req.uid]);
    return g.rows[0].id;
  });
  for (const uid of (JSON.parse(req.body.invite || '[]'))) await notify({ userId: Number(uid), actorId: req.uid, type: 'group_invite', groupId: id });
  res.status(201).json(await one(`SELECT ${GROUP_COLS} FROM groups g WHERE g.id = $2`, [req.uid, id]));
}));

r.get('/:id', ah(async (req, res) => {
  const g = await one(`SELECT ${GROUP_COLS} FROM groups g WHERE g.id = $2`, [req.uid, req.params.id]);
  if (!g) fail(404, 'Group not found');
  g.admins = await many(`SELECT ${userJson('u')} AS user FROM group_members m JOIN users u ON u.id = m.user_id
                         WHERE m.group_id = $1 AND m.role = 'admin'`, [g.id]);
  res.json(g);
}));

r.patch('/:id', upload.single('cover'), ah(async (req, res) => {
  await mustAdmin(req.uid, req.params.id);
  const { name, description, privacy } = req.body;
  await q(`UPDATE groups SET name = COALESCE($2, name), description = COALESCE($3, description),
             privacy = COALESCE($4, privacy), cover_url = COALESCE($5, cover_url) WHERE id = $1`,
    [req.params.id, name || null, description ?? null, ['public', 'private'].includes(privacy) ? privacy : null, fileUrl(req.file)]);
  res.json(await one(`SELECT ${GROUP_COLS} FROM groups g WHERE g.id = $2`, [req.uid, req.params.id]));
}));

r.delete('/:id', ah(async (req, res) => {
  await mustAdmin(req.uid, req.params.id);
  await q(`DELETE FROM groups WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

r.get('/:id/posts', ah(async (req, res) => {
  const g = await one(`SELECT privacy FROM groups WHERE id = $1`, [req.params.id]);
  if (!g) fail(404, 'Group not found');
  const limit = 10;
  const c = cursorWhere(req.query.before, 3);
  const rows = await fetchPosts(req.uid, `p.group_id = $2 AND ${c.sql}`, [req.params.id, ...c.params], { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit), private_locked: g.privacy === 'private' && !rows.length && (await role(req.uid, req.params.id)).status !== 'member' });
}));

r.post('/:id/join', ah(async (req, res) => {
  const g = await one(`SELECT id, privacy FROM groups WHERE id = $1`, [req.params.id]);
  if (!g) fail(404, 'Group not found');
  const status = g.privacy === 'public' ? 'member' : 'pending';
  await q(`INSERT INTO group_members (group_id, user_id, status) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [g.id, req.uid, status]);
  if (status === 'pending') {
    for (const a of await many(`SELECT user_id FROM group_members WHERE group_id = $1 AND role = 'admin'`, [g.id]))
      await notify({ userId: a.user_id, actorId: req.uid, type: 'group_join_request', groupId: g.id });
  }
  res.json({ status });
}));

r.delete('/:id/join', ah(async (req, res) => {
  const admins = await many(`SELECT user_id FROM group_members WHERE group_id = $1 AND role = 'admin' AND status = 'member'`, [req.params.id]);
  if (admins.length === 1 && admins[0].user_id === req.uid) {
    const other = await one(`SELECT user_id FROM group_members WHERE group_id = $1 AND user_id <> $2 AND status = 'member' ORDER BY joined_at LIMIT 1`, [req.params.id, req.uid]);
    if (other) await q(`UPDATE group_members SET role = 'admin' WHERE group_id = $1 AND user_id = $2`, [req.params.id, other.user_id]);
  }
  await q(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  res.json({ status: null });
}));

r.get('/:id/members', ah(async (req, res) => {
  const me = await role(req.uid, req.params.id);
  const members = await many(
    `SELECT ${userJson('u')} AS user, m.role, m.status, m.joined_at,
            EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $2 AND f.friend_id = u.id) AS is_friend
     FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = $1 AND NOT u.deactivated
       AND (m.status = 'member' OR $3) ORDER BY m.role, m.joined_at`,
    [req.params.id, req.uid, me.role === 'admin']);
  res.json({ members });
}));

r.post('/:id/members/:uid/approve', ah(async (req, res) => {
  await mustAdmin(req.uid, req.params.id);
  await q(`UPDATE group_members SET status = 'member', joined_at = now() WHERE group_id = $1 AND user_id = $2`, [req.params.id, req.params.uid]);
  await notify({ userId: Number(req.params.uid), actorId: req.uid, type: 'group_approved', groupId: Number(req.params.id) });
  res.json({ ok: true });
}));

r.patch('/:id/members/:uid', ah(async (req, res) => {
  await mustAdmin(req.uid, req.params.id);
  await q(`UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2`,
    [req.params.id, req.params.uid, req.body.role === 'admin' ? 'admin' : 'member']);
  res.json({ ok: true });
}));

r.delete('/:id/members/:uid', ah(async (req, res) => {
  await mustAdmin(req.uid, req.params.id);
  await q(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [req.params.id, req.params.uid]);
  res.json({ ok: true });
}));

r.post('/:id/invite', ah(async (req, res) => {
  if ((await role(req.uid, req.params.id)).status !== 'member') fail(403, 'Join the group first');
  for (const uid of req.body.user_ids || []) await notify({ userId: Number(uid), actorId: req.uid, type: 'group_invite', groupId: Number(req.params.id) });
  res.json({ ok: true });
}));

export default r;
