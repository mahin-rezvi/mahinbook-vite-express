import { Router } from 'express';
import { many, one, q, userJson } from '../db.js';
import { ah, fail, upload, fileUrl } from '../helpers.js';

const r = Router();

// Stories from me and my friends that haven't expired, grouped per user.
r.get('/', ah(async (req, res) => {
  const rows = await many(
    `SELECT s.id, s.user_id, s.media_url, s.text, s.bg, s.created_at, s.expires_at, ${userJson('u')} AS user,
            EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = $1) AS seen,
            CASE WHEN s.user_id = $1 THEN (SELECT count(*)::int FROM story_views v WHERE v.story_id = s.id) END AS view_count
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > now() AND NOT u.deactivated
       AND (s.user_id = $1 OR s.user_id IN (SELECT friend_id FROM friendships WHERE user_id = $1))
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
     ORDER BY s.created_at`, [req.uid]);
  const groups = new Map();
  for (const s of rows) {
    if (!groups.has(s.user_id)) groups.set(s.user_id, { user: s.user, stories: [] });
    groups.get(s.user_id).stories.push(s);
  }
  const list = [...groups.values()].map((g) => ({ ...g, all_seen: g.stories.every((s) => s.seen) }));
  list.sort((a, b) => (a.user.id === req.uid ? -1 : b.user.id === req.uid ? 1 : a.all_seen - b.all_seen));
  res.json({ users: list });
}));

r.post('/', upload.single('file'), ah(async (req, res) => {
  const { text, bg, privacy } = req.body;
  if (!req.file && !text?.trim()) fail(400, 'Add a photo or some text');
  const s = await one(
    `INSERT INTO stories (user_id, media_url, text, bg, privacy) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.uid, fileUrl(req.file), text || null, bg || null, ['public', 'friends'].includes(privacy) ? privacy : 'friends']);
  res.status(201).json(s);
}));

r.post('/:id/view', ah(async (req, res) => {
  await q(`INSERT INTO story_views (story_id, viewer_id)
           SELECT id, $2 FROM stories WHERE id = $1 AND user_id <> $2 ON CONFLICT DO NOTHING`, [req.params.id, req.uid]);
  res.json({ ok: true });
}));

r.get('/:id/viewers', ah(async (req, res) => {
  const s = await one(`SELECT user_id FROM stories WHERE id = $1`, [req.params.id]);
  if (!s || s.user_id !== req.uid) fail(403, 'Only the owner can see viewers');
  res.json({
    viewers: await many(
      `SELECT ${userJson('u')} AS user, v.viewed_at FROM story_views v JOIN users u ON u.id = v.viewer_id
       WHERE v.story_id = $1 ORDER BY v.viewed_at DESC`, [req.params.id]),
  });
}));

r.delete('/:id', ah(async (req, res) => {
  await q(`DELETE FROM stories WHERE id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  res.json({ ok: true });
}));

export default r;
