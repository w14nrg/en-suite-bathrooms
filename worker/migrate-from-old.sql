-- Run this only when upgrading the earlier Pushover prototype database.
ALTER TABLE conversations ADD COLUMN first_unread_at TEXT;
ALTER TABLE conversations ADD COLUMN push_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN last_push_at TEXT;

CREATE TABLE IF NOT EXISTS push_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  device_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread, first_unread_at);
CREATE INDEX IF NOT EXISTS idx_push_devices_enabled ON push_devices(enabled);
