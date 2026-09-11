CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  configuration TEXT,
  reporter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS reports_created_at ON reports(created_at DESC);

CREATE TABLE IF NOT EXISTS report_users (
  id TEXT PRIMARY KEY,
  person_name TEXT NOT NULL,
  work_name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Helper')),
  pin_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS report_users_created_at ON report_users(created_at ASC);

INSERT OR IGNORE INTO report_users (id, person_name, work_name, role, pin_hash) VALUES
  ('builtin-admin', 'Sebastian', 'Admin', 'Admin', '911c06c0297b0dc2a5a3eb30b8bfbaa5a36a3c23c3fec23712a45477f12b963a'),
  ('builtin-helper2', 'Theresa', 'Helper2', 'Helper', 'a9444f51a1eccdfcb20758bd550a9b579a997371696e7e8d670ebf82df98b019'),
  ('builtin-helper3', 'Felix', 'Helper3', 'Helper', '39e91335c32659ef778fb32fcaf617d01e9efd7543a4cde2a35217503c7e3721');

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('intro_enabled', '1');

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  configuration TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, configuration)
);

CREATE INDEX IF NOT EXISTS projects_user_updated_at ON projects(user_id, updated_at DESC);
