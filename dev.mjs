// Runs the API (with --watch) and the Vite dev server together.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  ['api', spawn(npm, ['run', 'dev', '--prefix', 'server'], { stdio: ['ignore', 'pipe', 'pipe'] })],
  ['web', spawn(npm, ['run', 'dev', '--prefix', 'client'], { stdio: ['ignore', 'pipe', 'pipe'] })],
];
for (const [name, p] of procs) {
  const tag = name === 'api' ? '\x1b[35m[api]\x1b[0m' : '\x1b[36m[web]\x1b[0m';
  const out = (buf) => buf.toString().split('\n').filter(Boolean).forEach((l) => console.log(`${tag} ${l}`));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => { console.log(`${tag} exited (${code})`); stopAll(); });
}
function stopAll() { for (const [, p] of procs) if (!p.killed) p.kill(); }
process.on('SIGINT', () => { stopAll(); process.exit(0); });
