// Pages, Events, Marketplace and Search
import { Router } from 'express';
import { many, one, q, userJson } from '../db.js';
import { ah, fail, upload, fileUrl, fetchPosts, cursorWhere, nextCursor, notify, visibleTo } from '../helpers.js';

/* ---------------- Pages ---------------- */
export const pages = Router();
const PAGE_COLS = `pg.id, pg.name, pg.category, pg.description, pg.avatar_url, pg.cover_url, pg.owner_id, pg.created_at,
  (SELECT count(*)::int FROM page_follows f WHERE f.page_id = pg.id) AS follower_count,
  EXISTS (SELECT 1 FROM page_follows f WHERE f.page_id = pg.id AND f.user_id = $1) AS following`;

pages.get('/', ah(async (req, res) => {
  res.json({
    mine: await many(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.owner_id = $1 ORDER BY pg.name`, [req.uid]),
    following: await many(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.id IN (SELECT page_id FROM page_follows WHERE user_id = $1) ORDER BY pg.name`, [req.uid]),
    discover: await many(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.owner_id <> $1 AND pg.id NOT IN (SELECT page_id FROM page_follows WHERE user_id = $1)
                          ORDER BY follower_count DESC LIMIT 20`, [req.uid]),
  });
}));

pages.post('/', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), ah(async (req, res) => {
  const { name, category = '', description = '' } = req.body;
  if (!name?.trim()) fail(400, 'Page name is required');
  const p = await one(`INSERT INTO pages (owner_id, name, category, description, avatar_url, cover_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.uid, name.trim(), category, description, fileUrl(req.files?.avatar?.[0]), fileUrl(req.files?.cover?.[0])]);
  res.status(201).json(await one(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.id = $2`, [req.uid, p.id]));
}));

pages.get('/:id', ah(async (req, res) => {
  const p = await one(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.id = $2`, [req.uid, req.params.id]);
  if (!p) fail(404, 'Page not found');
  res.json(p);
}));

pages.patch('/:id', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), ah(async (req, res) => {
  const p = await one(`SELECT owner_id FROM pages WHERE id = $1`, [req.params.id]);
  if (!p || p.owner_id !== req.uid) fail(403, 'Not your page');
  const { name, category, description } = req.body;
  await q(`UPDATE pages SET name = COALESCE($2,name), category = COALESCE($3,category), description = COALESCE($4,description),
           avatar_url = COALESCE($5, avatar_url), cover_url = COALESCE($6, cover_url) WHERE id = $1`,
    [req.params.id, name || null, category ?? null, description ?? null, fileUrl(req.files?.avatar?.[0]), fileUrl(req.files?.cover?.[0])]);
  res.json(await one(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.id = $2`, [req.uid, req.params.id]));
}));

pages.delete('/:id', ah(async (req, res) => {
  await q(`DELETE FROM pages WHERE id = $1 AND owner_id = $2`, [req.params.id, req.uid]);
  res.json({ ok: true });
}));

pages.get('/:id/posts', ah(async (req, res) => {
  const limit = 10;
  const c = cursorWhere(req.query.before, 3);
  const rows = await fetchPosts(req.uid, `p.page_id = $2 AND ${c.sql}`, [req.params.id, ...c.params], { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit) });
}));

pages.post('/:id/follow', ah(async (req, res) => {
  const p = await one(`SELECT owner_id FROM pages WHERE id = $1`, [req.params.id]);
  if (!p) fail(404, 'Page not found');
  await q(`INSERT INTO page_follows (page_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, req.uid]);
  await notify({ userId: p.owner_id, actorId: req.uid, type: 'page_follow', data: { page_id: Number(req.params.id) } });
  res.json({ following: true });
}));
pages.delete('/:id/follow', ah(async (req, res) => {
  await q(`DELETE FROM page_follows WHERE page_id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  res.json({ following: false });
}));

/* ---------------- Events ---------------- */
export const events = Router();
const EVENT_COLS = `e.id, e.title, e.description, e.location, e.starts_at, e.cover_url, e.privacy, e.created_at, ${userJson('h')} AS host,
  (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going_count,
  (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested') AS interested_count,
  (SELECT status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $1) AS my_status`;
const EVENT_VISIBLE = `(e.privacy = 'public' OR e.host_id = $1 OR EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = e.host_id))`;

events.get('/', ah(async (req, res) => {
  const scope = req.query.scope || 'upcoming';
  const where = {
    upcoming: `e.starts_at > now() - interval '6 hours'`,
    going: `e.id IN (SELECT event_id FROM event_rsvps WHERE user_id = $1)`,
    hosting: `e.host_id = $1`,
    past: `e.starts_at < now() AND (e.host_id = $1 OR e.id IN (SELECT event_id FROM event_rsvps WHERE user_id = $1))`,
  }[scope] || 'TRUE';
  res.json({
    events: await many(`SELECT ${EVENT_COLS} FROM events e JOIN users h ON h.id = e.host_id
                        WHERE ${EVENT_VISIBLE} AND ${where} ORDER BY e.starts_at ${scope === 'past' ? 'DESC' : 'ASC'} LIMIT 50`, [req.uid]),
  });
}));

events.post('/', upload.single('cover'), ah(async (req, res) => {
  const { title, description = '', location = '', starts_at, privacy = 'public' } = req.body;
  if (!title?.trim() || !starts_at) fail(400, 'Title and date are required');
  const e = await one(`INSERT INTO events (host_id, title, description, location, starts_at, cover_url, privacy)
                       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [req.uid, title.trim(), description, location, starts_at, fileUrl(req.file), privacy === 'friends' ? 'friends' : 'public']);
  await q(`INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1,$2,'going')`, [e.id, req.uid]);
  res.status(201).json(await one(`SELECT ${EVENT_COLS} FROM events e JOIN users h ON h.id = e.host_id WHERE e.id = $2`, [req.uid, e.id]));
}));

events.get('/:id', ah(async (req, res) => {
  const e = await one(`SELECT ${EVENT_COLS} FROM events e JOIN users h ON h.id = e.host_id WHERE e.id = $2 AND ${EVENT_VISIBLE}`, [req.uid, req.params.id]);
  if (!e) fail(404, 'Event not found');
  e.guests = await many(`SELECT ${userJson('u')} AS user, r.status FROM event_rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = $1 LIMIT 50`, [e.id]);
  res.json(e);
}));

events.post('/:id/rsvp', ah(async (req, res) => {
  const status = req.body.status;
  if (!status) await q(`DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  else await q(`INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1,$2,$3)
                ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
    [req.params.id, req.uid, status === 'interested' ? 'interested' : 'going']);
  res.json(await one(`SELECT ${EVENT_COLS} FROM events e JOIN users h ON h.id = e.host_id WHERE e.id = $2`, [req.uid, req.params.id]));
}));

events.post('/:id/invite', ah(async (req, res) => {
  for (const uid of req.body.user_ids || [])
    await notify({ userId: Number(uid), actorId: req.uid, type: 'event_invite', data: { event_id: Number(req.params.id) } });
  res.json({ ok: true });
}));

events.delete('/:id', ah(async (req, res) => {
  await q(`DELETE FROM events WHERE id = $1 AND host_id = $2`, [req.params.id, req.uid]);
  res.json({ ok: true });
}));

/* ---------------- Marketplace ---------------- */
export const market = Router();
const LISTING_COLS = `l.id, l.title, l.price, l.description, l.category, l.condition, l.location, l.image_url, l.status, l.created_at,
  ${userJson('s')} AS seller, EXISTS (SELECT 1 FROM saved_listings sl WHERE sl.listing_id = l.id AND sl.user_id = $1) AS saved`;

market.get('/', ah(async (req, res) => {
  const { q: text = '', category = '', min = '', max = '', scope = '' } = req.query;
  const params = [req.uid];
  const conds = [];
  if (scope === 'mine') conds.push('l.seller_id = $1');
  else if (scope === 'saved') conds.push('l.id IN (SELECT listing_id FROM saved_listings WHERE user_id = $1)');
  else conds.push(`l.status <> 'sold'`);
  if (text) { params.push(`%${text}%`); conds.push(`(l.title ILIKE $${params.length} OR l.description ILIKE $${params.length})`); }
  if (category) { params.push(category); conds.push(`l.category = $${params.length}`); }
  if (min) { params.push(Number(min)); conds.push(`l.price >= $${params.length}`); }
  if (max) { params.push(Number(max)); conds.push(`l.price <= $${params.length}`); }
  res.json({
    listings: await many(`SELECT ${LISTING_COLS} FROM listings l JOIN users s ON s.id = l.seller_id
       WHERE NOT s.deactivated AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = s.id) OR (b.blocker_id = s.id AND b.blocked_id = $1))
       AND ${conds.join(' AND ')} ORDER BY l.created_at DESC LIMIT 60`, params),
  });
}));

market.post('/', upload.single('image'), ah(async (req, res) => {
  const { title, price = 0, description = '', category = 'Other', condition = 'Used - Good', location = '' } = req.body;
  if (!title?.trim()) fail(400, 'Title is required');
  const l = await one(`INSERT INTO listings (seller_id, title, price, description, category, condition, location, image_url)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.uid, title.trim(), Number(price) || 0, description, category, condition, location, fileUrl(req.file)]);
  res.status(201).json(await one(`SELECT ${LISTING_COLS} FROM listings l JOIN users s ON s.id = l.seller_id WHERE l.id = $2`, [req.uid, l.id]));
}));

market.get('/:id', ah(async (req, res) => {
  const l = await one(`SELECT ${LISTING_COLS} FROM listings l JOIN users s ON s.id = l.seller_id WHERE l.id = $2`, [req.uid, req.params.id]);
  if (!l) fail(404, 'Listing not found');
  res.json(l);
}));

market.patch('/:id', ah(async (req, res) => {
  const { title, price, description, status, category, condition, location } = req.body;
  const l = await one(`UPDATE listings SET title = COALESCE($3,title), price = COALESCE($4,price), description = COALESCE($5,description),
         status = COALESCE($6,status), category = COALESCE($7,category), condition = COALESCE($8,condition), location = COALESCE($9,location)
       WHERE id = $1 AND seller_id = $2 RETURNING id`,
    [req.params.id, req.uid, title ?? null, price ?? null, description ?? null, status ?? null, category ?? null, condition ?? null, location ?? null]);
  if (!l) fail(403, 'Not your listing');
  res.json(await one(`SELECT ${LISTING_COLS} FROM listings l JOIN users s ON s.id = l.seller_id WHERE l.id = $2`, [req.uid, l.id]));
}));

market.delete('/:id', ah(async (req, res) => {
  await q(`DELETE FROM listings WHERE id = $1 AND seller_id = $2`, [req.params.id, req.uid]);
  res.json({ ok: true });
}));

market.post('/:id/save', ah(async (req, res) => {
  await q(`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.uid, req.params.id]);
  res.json({ saved: true });
}));
market.delete('/:id/save', ah(async (req, res) => {
  await q(`DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2`, [req.uid, req.params.id]);
  res.json({ saved: false });
}));

/* ---------------- Search ---------------- */
export const search = Router();

search.get('/', ah(async (req, res) => {
  const text = String(req.query.q || '').trim();
  const type = req.query.type || 'all';
  if (!text) return res.json({ people: [], posts: [], groups: [], pages: [], events: [] });
  const like = `%${text}%`;
  const lim = type === 'all' ? 5 : 30;
  const out = {};
  if (type === 'all' || type === 'people') {
    out.people = await many(
      `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url, u.city, u.work,
              EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = u.id) AS is_friend,
              (SELECT count(*)::int FROM friendships a JOIN friendships b ON a.friend_id = b.friend_id WHERE a.user_id = u.id AND b.user_id = $1) AS mutual_count
       FROM users u
       WHERE NOT u.deactivated AND (u.first_name || ' ' || u.last_name ILIKE $2 OR u.username ILIKE $2
              OR (lower(u.email) = lower($3) AND (u.id = $1 OR COALESCE(u.settings->>'lookup_by_email','everyone') = 'everyone'
                  OR (u.settings->>'lookup_by_email' = 'friends' AND EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = u.id)))))
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
       ORDER BY is_friend DESC, mutual_count DESC LIMIT ${lim}`, [req.uid, like, text]);
  }
  if (type === 'all' || type === 'posts') out.posts = await fetchPosts(req.uid, `p.content ILIKE $2`, [like], { limit: lim });
  if (type === 'all' || type === 'groups') {
    out.groups = await many(`SELECT g.id, g.name, g.privacy, g.cover_url, g.description,
        (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id AND m.status = 'member') AS member_count,
        (SELECT status FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1) AS my_status
      FROM groups g WHERE g.name ILIKE $2 OR g.description ILIKE $2 LIMIT ${lim}`, [req.uid, like]);
  }
  if (type === 'all' || type === 'pages')
    out.pages = await many(`SELECT ${PAGE_COLS} FROM pages pg WHERE pg.name ILIKE $2 OR pg.category ILIKE $2 LIMIT ${lim}`, [req.uid, like]);
  if (type === 'all' || type === 'events')
    out.events = await many(`SELECT ${EVENT_COLS} FROM events e JOIN users h ON h.id = e.host_id
                             WHERE ${EVENT_VISIBLE} AND (e.title ILIKE $2 OR e.location ILIKE $2) LIMIT ${lim}`, [req.uid, like]);
  res.json(out);
}));

// Lightweight typeahead for the top search bar and the people pickers.
search.get('/typeahead', ah(async (req, res) => {
  const text = String(req.query.q || '').trim();
  if (!text) return res.json({ people: [] });
  const friendsOnly = req.query.friends === '1';
  res.json({
    people: await many(
      `SELECT u.id, u.first_name, u.last_name, u.username, u.avatar_url,
              EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = u.id) AS is_friend
       FROM users u WHERE NOT u.deactivated AND u.id <> $1 AND (u.first_name || ' ' || u.last_name ILIKE $2 OR u.username ILIKE $2)
         ${friendsOnly ? 'AND EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $1 AND f.friend_id = u.id)' : ''}
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
       ORDER BY is_friend DESC, u.first_name LIMIT 8`, [req.uid, `%${text}%`]),
  });
}));

// Everything a single viewer is allowed to see of a post's media, for the photo viewer.
search.get('/visible-media/:postId', ah(async (req, res) => {
  const rows = await many(`SELECT m.id, m.url FROM post_media m JOIN posts p ON p.id = m.post_id JOIN users au ON au.id = p.author_id
                           WHERE p.id = $2 AND ${visibleTo('$1')} ORDER BY m.position`, [req.uid, req.params.postId]);
  res.json({ media: rows });
}));
