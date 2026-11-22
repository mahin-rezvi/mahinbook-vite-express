import pg from 'pg';
import dns from 'node:dns';
import net from 'node:net';

// Many home/office networks have no IPv6 route; prefer IPv4 and give slow links
// more than Node's default 250 ms per address before falling back.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC -> number
pg.types.setTypeParser(1082, (v) => v); // DATE stays a plain 'YYYY-MM-DD' string

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

pool.on('error', (err) => console.error('pg pool error', err.message));

export const q = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

export async function tx(fn) {
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
