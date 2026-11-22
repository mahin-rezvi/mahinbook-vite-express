import { Router } from 'express';
import { many, q } from '../db.js';
import { ah, NOTIF_SELECT } from '../helpers.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  res.json({
    notifications: await many(
      `${NOTIF_SELECT} WHERE n.user_id = $1 ${unreadOnly ? 'AND NOT n.read' : ''} ORDER BY n.created_at DESC LIMIT 60`, [req.uid]),
  });
}));

r.post('/read-all', ah(async (req, res) => {
  await q(`UPDATE notifications SET read = TRUE WHERE user_id = $1`, [req.uid]);
  res.json({ ok: true });
}));

r.post('/:id/read', ah(async (req, res) => {
  await q(`UPDATE notifications SET read = NOT $3 WHERE id = $1 AND user_id = $2`, [req.params.id, req.uid, req.body.unread === true]);
  res.json({ ok: true });
}));

r.delete('/:id', ah(async (req, res) => {
  await q(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  res.json({ ok: true });
}));

export default r;
