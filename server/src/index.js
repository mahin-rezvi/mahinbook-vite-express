import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import app from './app.js';
import { attachRealtime } from './realtime.js';

// In production, serve the built client from the same origin as the API.
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api|uploads|ws).*/, (_req, res, next) =>
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next()));

const server = http.createServer(app);
await attachRealtime(server);
const port = Number(process.env.PORT) || 4000;
server.listen(port, () => console.log(`MahinBook API on http://localhost:${port}`));
