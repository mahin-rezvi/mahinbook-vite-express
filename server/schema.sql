-- MahinBook schema (PostgreSQL / Neon)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Persistent uploads used by the free Cloudflare Worker deployment.
CREATE TABLE IF NOT EXISTS media_files (
  filename     TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,
  cover_url     TEXT,
  bio           TEXT DEFAULT '',
  birthday      DATE,
  gender        TEXT,
  city          TEXT DEFAULT '',
  hometown      TEXT DEFAULT '',
  work          TEXT DEFAULT '',
  education     TEXT DEFAULT '',
  relationship  TEXT DEFAULT '',
  website       TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  deactivated   BOOLEAN NOT NULL DEFAULT FALSE,
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Friendships are stored in both directions for simple lookups.
CREATE TABLE IF NOT EXISTS friendships (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  from_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  privacy     TEXT NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','private')),
  cover_url   TEXT,
  created_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status    TEXT NOT NULL DEFAULT 'member' CHECK (status IN ('member','pending')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS pages (
  id          SERIAL PRIMARY KEY,
  owner_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT DEFAULT '',
  description TEXT DEFAULT '',
  avatar_url  TEXT,
  cover_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_follows (
  page_id INT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (page_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id             SERIAL PRIMARY KEY,
  author_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content        TEXT DEFAULT '',
  feeling        TEXT,
  location       TEXT,
  bg             TEXT,
  privacy        TEXT NOT NULL DEFAULT 'friends' CHECK (privacy IN ('public','friends','only_me')),
  group_id       INT REFERENCES groups(id) ON DELETE CASCADE,
  wall_user_id   INT REFERENCES users(id) ON DELETE CASCADE,
  page_id        INT REFERENCES pages(id) ON DELETE CASCADE,
  shared_post_id INT REFERENCES posts(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_group_idx ON posts(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_wall_idx ON posts(wall_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_media (
  id       SERIAL PRIMARY KEY,
  post_id  INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS post_media_post_idx ON post_media(post_id);

CREATE TABLE IF NOT EXISTS reactions (
  post_id    INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('like','love','care','haha','wow','sad','angry')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         SERIAL PRIMARY KEY,
  post_id    INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INT REFERENCES comments(id) ON DELETE CASCADE,
  content    TEXT DEFAULT '',
  image_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'like',
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS saved_posts (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS hidden_posts (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url  TEXT,
  text       TEXT,
  bg         TEXT,
  privacy    TEXT NOT NULL DEFAULT 'friends',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id  INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL PRIMARY KEY,
  is_group   BOOLEAN NOT NULL DEFAULT FALSE,
  title      TEXT,
  image_url  TEXT,
  emoji      TEXT DEFAULT '👍',
  color      TEXT DEFAULT '#0a7cff',
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id    INT NOT NULL DEFAULT 0,
  muted           BOOLEAN NOT NULL DEFAULT FALSE,
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  nickname        TEXT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conv_members_user_idx ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INT REFERENCES users(id) ON DELETE SET NULL,
  content         TEXT DEFAULT '',
  image_url       TEXT,
  reply_to_id     INT REFERENCES messages(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL DEFAULT 'text',
  deleted         BOOLEAN NOT NULL DEFAULT FALSE,
  edited          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, id DESC);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   INT REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  post_id    INT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id INT REFERENCES comments(id) ON DELETE CASCADE,
  group_id   INT REFERENCES groups(id) ON DELETE CASCADE,
  data       JSONB DEFAULT '{}'::jsonb,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS listings (
  id          SERIAL PRIMARY KEY,
  seller_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  category    TEXT DEFAULT 'Other',
  condition   TEXT DEFAULT 'Used - Good',
  location    TEXT DEFAULT '',
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','pending','sold')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  host_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  location    TEXT DEFAULT '',
  starts_at   TIMESTAMPTZ NOT NULL,
  cover_url   TEXT,
  privacy     TEXT NOT NULL DEFAULT 'public',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status   TEXT NOT NULL CHECK (status IN ('going','interested')),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
);
