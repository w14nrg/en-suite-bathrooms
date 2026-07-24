PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  mode TEXT NOT NULL DEFAULT 'bot',
  step INTEGER NOT NULL DEFAULT 0,
  project_type TEXT,
  postcode TEXT,
  project_brief TEXT,
  timing TEXT,
  customer_name TEXT,
  contact TEXT,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  unread INTEGER NOT NULL DEFAULT 0,
  first_unread_at TEXT,
  last_customer_at TEXT,
  last_owner_at TEXT,
  push_count INTEGER NOT NULL DEFAULT 0,
  last_push_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'owner', 'system')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS owner_presence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS push_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  device_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO owner_presence (id, last_seen_at) VALUES (1, NULL);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread, first_unread_at);
CREATE INDEX IF NOT EXISTS idx_push_devices_enabled ON push_devices(enabled);
