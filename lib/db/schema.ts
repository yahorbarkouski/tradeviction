export const SCHEMA_VERSION = "market-pg-1";

export const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  muted INTEGER NOT NULL DEFAULT 0,
  show_dead INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS startups (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('hn', 'manual')),
  source_id TEXT,
  created_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS startups_url ON startups(url);
CREATE UNIQUE INDEX IF NOT EXISTS startups_domain ON startups(domain) WHERE domain <> '';
CREATE UNIQUE INDEX IF NOT EXISTS startups_source_id
  ON startups(source, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  startup_id TEXT NOT NULL REFERENCES startups(id),
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  conviction INTEGER NOT NULL CHECK (conviction >= 0 AND conviction <= 100),
  note TEXT NOT NULL,
  opened_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  closed_at BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS positions_one_open
  ON positions(user_id, startup_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS positions_startup_open
  ON positions(startup_id, closed_at, opened_at);
CREATE INDEX IF NOT EXISTS positions_user_open
  ON positions(user_id, closed_at);

CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  startup_id TEXT NOT NULL REFERENCES startups(id),
  position_id TEXT NOT NULL REFERENCES positions(id),
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  conviction INTEGER NOT NULL CHECK (conviction > 0),
  entry_p DOUBLE PRECISION NOT NULL,
  entry_pulse INTEGER NOT NULL,
  entry_depth INTEGER NOT NULL,
  opened_at BIGINT NOT NULL,
  closed_at BIGINT,
  realized_alpha DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS lots_open ON lots(user_id, closed_at);
CREATE INDEX IF NOT EXISTS lots_position ON lots(position_id, opened_at);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  startup_id TEXT NOT NULL REFERENCES startups(id),
  kind TEXT NOT NULL CHECK (kind IN ('open', 'close', 'increase', 'decrease', 'flip', 'thesis')),
  direction TEXT CHECK (direction IN ('long', 'short')),
  conviction INTEGER,
  pulse INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  note TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_startup ON events(startup_id, created_at);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id, created_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  startup_id TEXT NOT NULL REFERENCES startups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES comments(id),
  position_id TEXT REFERENCES positions(id),
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS comments_startup ON comments(startup_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent ON comments(parent_id);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id TEXT NOT NULL REFERENCES comments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS comment_flags (
  comment_id TEXT NOT NULL REFERENCES comments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS comment_vouches (
  comment_id TEXT NOT NULL REFERENCES comments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS moves (
  user_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS rate_log (
  user_id TEXT,
  ip TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_log_user_kind ON rate_log(user_id, kind, created_at);
CREATE INDEX IF NOT EXISTS rate_log_ip_kind ON rate_log(ip, kind, created_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
