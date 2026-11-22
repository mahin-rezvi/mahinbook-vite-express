import { Router } from 'express';
import { many, one, q, tx, userJson } from '../db.js';
import {
  ah, fail, upload, fileUrl, fetchPosts, getPost, cursorWhere, nextCursor, notify, areFriends, visibleTo,
} from '../helpers.js';
import { withDefaults } from '../auth.js';

const r = Router();
const REACTIONS = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'];
const PRIVACY = ['public', 'friends', 'only_me'];

// News feed: friends, self, joined groups, followed pages, wall posts, plus public "suggested" posts.
r.get('/feed', ah(async (req, res) => {
  const limit = 10;
  const c = cursorWhere(req.query.before, 2);
  const rows = await fetchPosts(req.uid, `
    NOT EXISTS (SELECT 1 FROM hidden_posts h WHERE h.user_id = $1 AND h.post_id = p.id)
    AND (
      p.author_id = $1 OR p.wall_user_id = $1
      OR (p.group_id IS NULL AND p.page_id IS NULL AND p.author_id IN (SELECT friend_id FROM friendships WHERE user_id = $1))
      OR p.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1 AND status = 'member')
      OR p.page_id IN (SELECT page_id FROM page_follows WHERE user_id = $1)
      OR (p.privacy = 'public' AND p.group_id IS NULL)
    ) AND ${c.sql}`, c.params, { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit) });
}));

// "Video" tab: visible posts that contain a video file.
r.get('/videos', ah(async (req, res) => {
  const limit = 10;
  const c = cursorWhere(req.query.before, 2);
  const rows = await fetchPosts(req.uid,
    `EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.url ~* '\\.(mp4|webm|mov|ogg)$') AND ${c.sql}`, c.params, { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit) });
}));

// Memories: your own posts from more than 30 days ago, newest first.
r.get('/memories', ah(async (req, res) => {
  const limit = 10;
  const c = cursorWhere(req.query.before, 2);
  const rows = await fetchPosts(req.uid,
    `p.author_id = $1 AND p.created_at < now() - interval '30 days' AND ${c.sql}`, c.params, { limit });
  res.json({ posts: rows, next: nextCursor(rows, limit) });
}));

r.get('/saved', ah(async (req, res) => {
  const rows = await fetchPosts(req.uid, `p.id IN (SELECT post_id FROM saved_posts WHERE user_id = $1)`, [], { limit: 50 });
  res.json({ posts: rows });
}));

r.post('/', upload.array('files', 10), ah(async (req, res) => {
  const { content = '', feeling, location, bg } = req.body;
  const group_id = req.body.group_id ? Number(req.body.group_id) : null;
  const page_id = req.body.page_id ? Number(req.body.page_id) : null;
  let wall_user_id = req.body.wall_user_id ? Number(req.body.wall_user_id) : null;
  if (wall_user_id === req.uid) wall_user_id = null;
  const me = await one(`SELECT settings FROM users WHERE id = $1`, [req.uid]);
  let privacy = PRIVACY.includes(req.body.privacy) ? req.body.privacy : withDefaults(me.settings).default_audience;
  const files = req.files || [];
  if (!content.trim() && !files.length) fail(400, 'Your post is empty');

  if (group_id) {
    const m = await one(`SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='member'`, [group_id, req.uid]);
    if (!m) fail(403, 'Join the group to post');
  }
  if (page_id) {
    if (!(await one(`SELECT 1 FROM pages WHERE id=$1 AND owner_id=$2`, [page_id, req.uid]))) fail(403, 'Not your page');
    privacy = 'public';
  }
  if (wall_user_id) {
    const target = await one(`SELECT settings FROM users WHERE id=$1`, [wall_user_id]);
    if (!target || !(await areFriends(req.uid, wall_user_id)) || withDefaults(target.settings).wall_posting !== 'friends')
      fail(403, 'You cannot post on this timeline');
    if (privacy === 'only_me') privacy = 'friends';
  }

  const id = await tx(async (c) => {
    const p = await c.query(
      `INSERT INTO posts (author_id, content, feeling, location, bg, privacy, group_id, page_id, wall_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.uid, content, feeling || null, location || null, files.length ? null : bg || null, privacy, group_id, page_id, wall_user_id]);
    for (const [i, f] of files.entries())
      await c.query(`INSERT INTO post_media (post_id, url, position) VALUES ($1,$2,$3)`, [p.rows[0].id, fileUrl(f), i]);
    return p.rows[0].id;
  });

  if (wall_user_id) await notify({ userId: wall_user_id, actorId: req.uid, type: 'wall_post', postId: id });
  if (group_id) {
    const admins = await many(`SELECT user_id FROM group_members WHERE group_id=$1 AND role='admin'`, [group_id]);
    for (const a of admins) await notify({ userId: a.user_id, actorId: req.uid, type: 'group_post', postId: id, groupId: group_id });
  }
  res.status(201).json(await getPost(req.uid, id));
}));

r.get('/:id', ah(async (req, res) => {
  const p = await getPost(req.uid, req.params.id);
  if (!p) fail(404, 'This content isn\'t available right now');
  res.json(p);
}));

r.patch('/:id', ah(async (req, res) => {
  const p = await one(`SELECT author_id FROM posts WHERE id = $1`, [req.params.id]);
  if (!p || p.author_id !== req.uid) fail(403, 'You can only edit your own posts');
  const { content, privacy, feeling, location } = req.body;
  if (privacy !== undefined && !PRIVACY.includes(privacy)) fail(400, 'Invalid audience');
  await q(`UPDATE posts SET content = COALESCE($2, content), privacy = COALESCE($3, privacy),
             feeling = CASE WHEN $4::text IS NULL THEN feeling ELSE NULLIF($4, '') END,
             location = CASE WHEN $5::text IS NULL THEN location ELSE NULLIF($5, '') END,
             updated_at = CASE WHEN $2::text IS NOT NULL THEN now() ELSE updated_at END
           WHERE id = $1`, [req.params.id, content ?? null, privacy ?? null, feeling ?? null, location ?? null]);
  res.json(await getPost(req.uid, req.params.id));
}));

r.delete('/:id', ah(async (req, res) => {
  const p = await one(`SELECT author_id, wall_user_id, group_id FROM posts WHERE id = $1`, [req.params.id]);
  if (!p) fail(404, 'Post not found');
  const isGroupAdmin = p.group_id && (await one(
    `SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin'`, [p.group_id, req.uid]));
  if (p.author_id !== req.uid && p.wall_user_id !== req.uid && !isGroupAdmin) fail(403, 'You cannot delete this post');
  await q(`DELETE FROM posts WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

async function mustSee(uid, postId) {
  const p = await one(`SELECT p.id, p.author_id FROM posts p JOIN users au ON au.id = p.author_id
                       WHERE p.id = $2 AND ${visibleTo('$1')}`, [uid, postId]);
  if (!p) fail(404, 'This content isn\'t available right now');
  return p;
}

r.post('/:id/react', ah(async (req, res) => {
  const type = req.body.type || 'like';
  if (!REACTIONS.includes(type)) fail(400, 'Unknown reaction');
  const p = await mustSee(req.uid, req.params.id);
  await q(`INSERT INTO reactions (post_id, user_id, type) VALUES ($1,$2,$3)
           ON CONFLICT (post_id, user_id) DO UPDATE SET type = EXCLUDED.type, created_at = now()`, [p.id, req.uid, type]);
  await notify({ userId: p.author_id, actorId: req.uid, type: 'reaction', postId: p.id, data: { reaction: type } });
  res.json(await getPost(req.uid, p.id));
}));

r.delete('/:id/react', ah(async (req, res) => {
  await q(`DELETE FROM reactions WHERE post_id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  await q(`DELETE FROM notifications WHERE actor_id = $2 AND post_id = $1 AND type = 'reaction'`, [req.params.id, req.uid]);
  res.json(await getPost(req.uid, req.params.id));
}));

r.get('/:id/reactions', ah(async (req, res) => {
  await mustSee(req.uid, req.params.id);
  res.json({
    reactions: await many(
      `SELECT r.type, ${userJson('u')} AS user,
              EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = $2 AND f.friend_id = u.id) AS is_friend
       FROM reactions r JOIN users u ON u.id = r.user_id WHERE r.post_id = $1 ORDER BY r.created_at DESC`,
      [req.params.id, req.uid]),
  });
}));

r.post('/:id/share', ah(async (req, res) => {
  const orig = await mustSee(req.uid, req.params.id);
  // Share the root post, not a share of a share.
  const root = await one(`SELECT COALESCE(shared_post_id, id) AS id, author_id FROM posts WHERE id = $1`, [orig.id]);
  const rootAuthor = (await one(`SELECT author_id FROM posts WHERE id = $1`, [root.id])).author_id;
  const privacy = PRIVACY.includes(req.body.privacy) ? req.body.privacy : 'friends';
  const group_id = req.body.group_id ? Number(req.body.group_id) : null;
  const p = await one(
    `INSERT INTO posts (author_id, content, privacy, shared_post_id, group_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [req.uid, req.body.content || '', privacy, root.id, group_id]);
  await notify({ userId: rootAuthor, actorId: req.uid, type: 'share', postId: root.id });
  res.status(201).json(await getPost(req.uid, p.id));
}));

r.post('/:id/save', ah(async (req, res) => {
  await mustSee(req.uid, req.params.id);
  await q(`INSERT INTO saved_posts (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.uid, req.params.id]);
  res.json({ saved: true });
}));
r.delete('/:id/save', ah(async (req, res) => {
  await q(`DELETE FROM saved_posts WHERE user_id = $1 AND post_id = $2`, [req.uid, req.params.id]);
  res.json({ saved: false });
}));
r.post('/:id/hide', ah(async (req, res) => {
  await q(`INSERT INTO hidden_posts (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.uid, req.params.id]);
  res.json({ hidden: true });
}));
r.delete('/:id/hide', ah(async (req, res) => {
  await q(`DELETE FROM hidden_posts WHERE user_id = $1 AND post_id = $2`, [req.uid, req.params.id]);
  res.json({ hidden: false });
}));

/* ---------------- Comments ---------------- */

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.parent_id, c.content, c.image_url, c.created_at, c.updated_at, ${userJson('u')} AS user,
         (SELECT count(*)::int FROM comment_reactions cr WHERE cr.comment_id = c.id) AS like_count,
         (SELECT type FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.user_id = $1) AS my_reaction
  FROM comments c JOIN users u ON u.id = c.user_id`;

r.get('/:id/comments', ah(async (req, res) => {
  await mustSee(req.uid, req.params.id);
  const comments = await many(
    `${COMMENT_SELECT} WHERE c.post_id = $2 AND NOT u.deactivated
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
     ORDER BY c.created_at`, [req.uid, req.params.id]);
  res.json({ comments });
}));

r.post('/:id/comments', upload.single('image'), ah(async (req, res) => {
  const p = await mustSee(req.uid, req.params.id);
  const content = (req.body.content || '').trim();
  if (!content && !req.file) fail(400, 'Write a comment');
  let parent = null;
  if (req.body.parent_id) {
    parent = await one(`SELECT id, user_id, parent_id FROM comments WHERE id = $1 AND post_id = $2`, [req.body.parent_id, p.id]);
    if (!parent) fail(404, 'Comment not found');
  }
  // Keep threads two levels deep, like the real thing.
  const parentId = parent ? parent.parent_id || parent.id : null;
  const c = await one(
    `INSERT INTO comments (post_id, user_id, parent_id, content, image_url) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [p.id, req.uid, parentId, content, fileUrl(req.file)]);
  await notify({ userId: p.author_id, actorId: req.uid, type: 'comment', postId: p.id, commentId: c.id,
    data: { snippet: content.slice(0, 80) } });
  if (parent && parent.user_id !== p.author_id)
    await notify({ userId: parent.user_id, actorId: req.uid, type: 'reply', postId: p.id, commentId: c.id,
      data: { snippet: content.slice(0, 80) } });
  res.status(201).json(await one(`${COMMENT_SELECT} WHERE c.id = $2`, [req.uid, c.id]));
}));

export const commentsRouter = Router();

commentsRouter.patch('/:id', ah(async (req, res) => {
  const c = await one(`SELECT user_id FROM comments WHERE id = $1`, [req.params.id]);
  if (!c || c.user_id !== req.uid) fail(403, 'You can only edit your own comments');
  await q(`UPDATE comments SET content = $2, updated_at = now() WHERE id = $1`, [req.params.id, req.body.content || '']);
  res.json(await one(`${COMMENT_SELECT} WHERE c.id = $2`, [req.uid, req.params.id]));
}));

commentsRouter.delete('/:id', ah(async (req, res) => {
  const c = await one(`SELECT c.user_id, p.author_id FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = $1`, [req.params.id]);
  if (!c || (c.user_id !== req.uid && c.author_id !== req.uid)) fail(403, 'You cannot delete this comment');
  await q(`DELETE FROM comments WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

commentsRouter.post('/:id/react', ah(async (req, res) => {
  const c = await one(`SELECT id, user_id, post_id FROM comments WHERE id = $1`, [req.params.id]);
  if (!c) fail(404, 'Comment not found');
  await mustSee(req.uid, c.post_id);
  const type = REACTIONS.includes(req.body.type) ? req.body.type : 'like';
  await q(`INSERT INTO comment_reactions (comment_id, user_id, type) VALUES ($1,$2,$3)
           ON CONFLICT (comment_id, user_id) DO UPDATE SET type = EXCLUDED.type`, [c.id, req.uid, type]);
  await notify({ userId: c.user_id, actorId: req.uid, type: 'comment_like', postId: c.post_id, commentId: c.id });
  res.json(await one(`${COMMENT_SELECT} WHERE c.id = $2`, [req.uid, c.id]));
}));

commentsRouter.delete('/:id/react', ah(async (req, res) => {
  await q(`DELETE FROM comment_reactions WHERE comment_id = $1 AND user_id = $2`, [req.params.id, req.uid]);
  res.json(await one(`${COMMENT_SELECT} WHERE c.id = $2`, [req.uid, req.params.id]));
}));

export default r;
