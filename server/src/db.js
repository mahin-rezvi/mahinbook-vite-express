import pg from 'pg';
import dns from 'node:dns';
import net from 'node:net';
import { AsyncLocalStorage } from 'node:async_hooks';

// Many home/office networks have no IPv6 route; prefer IPv4 and give slow links
// more than Node's default 250 ms per address before falling back.
if (process.env.MAHINBOOK_WORKER !== '1') {
  dns.setDefaultResultOrder('ipv4first');
  net.setDefaultAutoSelectFamilyAttemptTimeout(2000);
}

pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC -> number
pg.types.setTypeParser(1082, (v) => v); // DATE stays a plain 'YYYY-MM-DD' string

const IS_WORKER = process.env.MAHINBOOK_WORKER === '1';
const requestClients = new AsyncLocalStorage();
export const pool = IS_WORKER ? null : new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

pool?.on('error', (err) => console.error('pg pool error', err.message));

async function query(text, params) {
  if (!IS_WORKER) return pool.query(text, params);
  const requestClient = requestClients.getStore();
  if (requestClient) return requestClient.query(text, params);
  // Durable Object event handlers do not pass through Express middleware. Give
  // those individual queries their own short-lived client; Hyperdrive pools origin connections.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client.query(text, params);
}

export const q = query;
export const one = async (text, params) => (await query(text, params)).rows[0] || null;
export const many = async (text, params) => (await query(text, params)).rows;

export function withRequestDatabase(req, res, next) {
  if (!IS_WORKER) return next();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  client.on('error', (err) => console.error('pg request client error', err.message));
  client.connect()
    .then(() => requestClients.run(client, next))
    .catch(next);
}

export async function tx(fn) {
  if (IS_WORKER) {
    let client = requestClients.getStore();
    if (!client) {
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
    }
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Columns safe to expose about any user.
export const PUBLIC_USER_COLS = `u.id, u.first_name, u.last_name, u.username, u.avatar_url, u.last_active`;
export const userJson = (alias = 'u') =>
  `json_build_object('id', ${alias}.id, 'first_name', ${alias}.first_name, 'last_name', ${alias}.last_name,
     'username', ${alias}.username, 'avatar_url', ${alias}.avatar_url)`;
