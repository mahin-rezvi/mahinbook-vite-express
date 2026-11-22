// DESTRUCTIVE: wipes every MahinBook table, then re-seeds the demo data.
// Usage: npm run reset -- --yes
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pool } from './db.js';

if (!process.argv.includes('--yes')) {
  console.error('This deletes ALL data in the database. Re-run with: npm run reset -- --yes');
  process.exit(1);
}

const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
console.log(`Truncated ${tables.length} tables.`);
await pool.end();

const seed = spawnSync(process.execPath, ['--env-file=.env', 'src/seed.js'], { stdio: 'inherit' });
process.exit(seed.status ?? 1);
