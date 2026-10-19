-- JDog Social D1 schema v1
-- Preparation only: this schema does not migrate existing Durable Object data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(username_key);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS profiles (
  username_key TEXT PRIMARY KEY REFERENCES users(username_key) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  favorite_game TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#a78bfa',
  banner_url TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  display_badge TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(username_key, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts(category, created_at DESC, id);

CREATE TABLE IF NOT EXISTS follows (
  follower_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  followed_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_key, followed_key),
  CHECK (follower_key <> followed_key)
);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_key, follower_key);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, username_key)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  UNIQUE (post_id, reporter_key)
);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  blocked_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_key, blocked_key),
  CHECK (blocker_key <> blocked_key)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  post_id TEXT,
  comment_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_key, created_at DESC);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_groups_created ON groups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_key, created_at DESC);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, username_key)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(username_key, group_id);

CREATE TABLE IF NOT EXISTS group_posts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_posts_created ON group_posts(group_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY,
  username_key TEXT NOT NULL REFERENCES users(username_key) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_user_created ON media_objects(username_key, created_at DESC);
