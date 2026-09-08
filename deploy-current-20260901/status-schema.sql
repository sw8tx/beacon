CREATE TABLE IF NOT EXISTS status_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_history (
  date TEXT PRIMARY KEY,
  reports INTEGER NOT NULL DEFAULT 0,
  ping_total INTEGER NOT NULL DEFAULT 0,
  last_minute TEXT,
  last_report_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
