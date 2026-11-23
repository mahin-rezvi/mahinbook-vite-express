import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { requireAuth } from './auth.js';
import { UPLOAD_DIR, HttpError, ah } from './helpers.js';
import { one, withRequestDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import friendRoutes from './routes/friends.js';
import postRoutes, { commentsRouter } from './routes/posts.js';
import storyRoutes from './routes/stories.js';
import conversationRoutes, { messageRouter } from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import groupRoutes from './routes/groups.js';
import settingsRoutes from './routes/settings.js';
import { pages, events, market, search } from './routes/extras.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(withRequestDatabase);

if (process.env.MAHINBOOK_WORKER !== '1') {
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
}

// Worker uploads live in Postgres so they survive deployments and stay on the free
// database already used by MahinBook. Filenames are random and never user supplied.
app.get('/uploads/:filename', ah(async (req, res) => {
  if (!/^[a-f0-9]{24}(?:\.[a-z0-9]{1,8})?$/i.test(req.params.filename))
    return res.status(404).end();
  const file = await one(`SELECT content_type, data FROM media_files WHERE filename = $1`, [req.params.filename]);
  if (!file) return res.status(404).end();
  res.set({
    'Content-Type': file.content_type,
    'Cache-Control': 'public, max-age=604800, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(file.data);
}));

app.get('/api/health', ah(async (_req, res) => {
  await one('SELECT 1');
  res.json({ ok: true, database: 'connected' });
}));
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/friends', requireAuth, friendRoutes);
app.use('/api/posts', requireAuth, postRoutes);
app.use('/api/comments', requireAuth, commentsRouter);
app.use('/api/stories', requireAuth, storyRoutes);
app.use('/api/conversations', requireAuth, conversationRoutes);
app.use('/api/messages', requireAuth, messageRouter);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/groups', requireAuth, groupRoutes);
app.use('/api/pages', requireAuth, pages);
app.use('/api/events', requireAuth, events);
app.use('/api/marketplace', requireAuth, market);
app.use('/api/search', requireAuth, search);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: process.env.MAHINBOOK_WORKER === '1'
    ? 'That file is too large (max 8 MB on this host)' : 'That file is too large (max 25 MB)' });
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
    return res.status(400).json({ error: 'Please upload fewer files at a time' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid id' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
