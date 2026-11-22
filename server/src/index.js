import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { requireAuth } from './auth.js';
import { attachRealtime } from './realtime.js';
import { UPLOAD_DIR, HttpError } from './helpers.js';
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
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
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

// In production, serve the built client.
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api|uploads|ws).*/, (_req, res, next) => res.sendFile(path.join(clientDist, 'index.html'), (e) => e && next()));

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large (max 25 MB)' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid id' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const server = http.createServer(app);
attachRealtime(server);
const port = Number(process.env.PORT) || 4000;
server.listen(port, () => console.log(`MahinBook API on http://localhost:${port}`));
