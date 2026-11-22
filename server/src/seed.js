// Seeds demo users, friendships, posts, a group, a page, an event, listings and a chat.
// All demo accounts use the password "password123".
import bcrypt from 'bcryptjs';
import { pool, one, q } from './db.js';

const people = [
  ['Ayesha', 'Rahman', 'Dhaka', 'Designer at Pixelcraft'],
  ['Tanvir', 'Hasan', 'Chattogram', 'Software Engineer'],
  ['Nusrat', 'Jahan', 'Sylhet', 'Teacher'],
  ['Rafi', 'Ahmed', 'Dhaka', 'Photographer'],
  ['Maya', 'Chowdhury', 'Khulna', 'Student at DU'],
  ['Imran', 'Karim', 'Rajshahi', 'Entrepreneur'],
  ['Sadia', 'Islam', 'Dhaka', 'Doctor'],
  ['Arif', 'Hossain', 'Barishal', 'Musician'],
];

const posts = [
  'Just finished a 10km run this morning! Feeling great 🏃‍♀️',
  'Anyone have good book recommendations for the weekend? 📚',
  'Sunset at the river today was unreal 🌅',
  'Started learning to cook biryani. Attempt #3 is finally edible 😂',
  'Big news coming soon... stay tuned!',
  'Throwback to the best trip of my life ✈️',
  'Coffee + code = happy Monday ☕',
  'Grateful for my amazing friends ❤️',
];

if ((await one(`SELECT count(*)::int c FROM users`)).c > 0) {
  console.log('Database already has users; skipping seed.');
  process.exit(0);
}

const hash = await bcrypt.hash('password123', 10);
const ids = [];
for (const [first, last, city, work] of people) {
  const u = await one(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, city, work, bio, gender, birthday)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [first, last, `${first}.${last}`.toLowerCase(), `${first}@demo.mahinbook`.toLowerCase(), hash, city, work,
      `Hi, I'm ${first}!`, ['Ayesha', 'Nusrat', 'Maya', 'Sadia'].includes(first) ? 'female' : 'male', '1998-05-14']);
  ids.push(u.id);
}

// Ring-ish friend graph so "mutual friends" and suggestions have something to show.
for (let i = 0; i < ids.length; i++) {
  for (const j of [i + 1, i + 2]) {
    if (j >= ids.length) continue;
    await q(`INSERT INTO friendships (user_id, friend_id) VALUES ($1,$2),($2,$1) ON CONFLICT DO NOTHING`, [ids[i], ids[j]]);
  }
}
await q(`INSERT INTO friend_requests (from_id, to_id) VALUES ($1,$2)`, [ids[7], ids[0]]);

const postIds = [];
for (const [i, text] of posts.entries()) {
  const p = await one(
    `INSERT INTO posts (author_id, content, privacy, created_at) VALUES ($1,$2,$3, now() - ($4 || ' hours')::interval) RETURNING id`,
    [ids[i % ids.length], text, i % 3 === 0 ? 'public' : 'friends', String(i * 3 + 1)]);
  postIds.push(p.id);
  if (i % 2 === 0) await q(`INSERT INTO post_media (post_id, url) VALUES ($1,$2)`, [p.id, `https://picsum.photos/seed/mb${i}/900/600`]);
}
const kinds = ['like', 'love', 'haha', 'wow', 'care'];
for (const [i, pid] of postIds.entries()) {
  for (let k = 0; k < 4; k++) {
    await q(`INSERT INTO reactions (post_id, user_id, type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [pid, ids[(i + k + 1) % ids.length], kinds[(i + k) % kinds.length]]);
  }
  await q(`INSERT INTO comments (post_id, user_id, content) VALUES ($1,$2,$3)`, [pid, ids[(i + 1) % ids.length], 'Love this! 🔥']);
}

const g = await one(`INSERT INTO groups (name, description, privacy, created_by) VALUES
  ('Dhaka Photographers', 'Share your best shots of the city.', 'public', $1) RETURNING id`, [ids[3]]);
for (const [i, uid] of ids.entries()) await q(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3)`, [g.id, uid, i === 3 ? 'admin' : 'member']);
await q(`INSERT INTO posts (author_id, content, group_id, privacy) VALUES ($1, 'Welcome everyone! Post your favourite shot this week 📷', $2, 'public')`, [ids[3], g.id]);

const pg = await one(`INSERT INTO pages (owner_id, name, category, description) VALUES ($1, 'Chai Corner Café', 'Café', 'Best tea in town since 2015.') RETURNING id`, [ids[5]]);
await q(`INSERT INTO page_follows (page_id, user_id) SELECT $1, unnest($2::int[])`, [pg.id, ids.slice(0, 5)]);
await q(`INSERT INTO posts (author_id, content, page_id, privacy) VALUES ($1, 'New cardamom latte is here! ☕ 20% off this week.', $2, 'public')`, [ids[5], pg.id]);

await q(`INSERT INTO events (host_id, title, description, location, starts_at) VALUES
  ($1, 'Weekend Photo Walk', 'Bring your camera, we walk through Old Dhaka.', 'Lalbagh Fort', now() + interval '5 days')`, [ids[3]]);

await q(`INSERT INTO listings (seller_id, title, price, description, category, location, image_url) VALUES
  ($1, 'Canon 200D DSLR', 42000, 'Barely used, comes with 18-55 lens.', 'Electronics', 'Dhaka', 'https://picsum.photos/seed/cam/600/600'),
  ($2, 'Wooden study desk', 6500, 'Solid wood, minor scratches.', 'Furniture', 'Chattogram', 'https://picsum.photos/seed/desk/600/600'),
  ($3, 'Road bicycle', 18000, '21-speed, great condition.', 'Vehicles', 'Sylhet', 'https://picsum.photos/seed/bike/600/600')`,
  [ids[3], ids[1], ids[2]]);

const c = await one(`INSERT INTO conversations (is_group) VALUES (FALSE) RETURNING id`);
await q(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3)`, [c.id, ids[0], ids[1]]);
await q(`INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1,$2,'Hey! Are you coming to the photo walk?'),($1,$3,'Yes! Wouldn''t miss it 📸')`,
  [c.id, ids[1], ids[0]]);

await q(`INSERT INTO stories (user_id, text, bg) VALUES ($1, 'Good morning! ☀️', 'linear-gradient(135deg,#f6d365,#fda085)'),
                                                  ($2, 'New blog post is live 🚀', 'linear-gradient(135deg,#667eea,#764ba2)')`, [ids[1], ids[2]]);

console.log(`Seeded ${ids.length} users. Log in as ayesha@demo.mahinbook / password123`);
await pool.end();
