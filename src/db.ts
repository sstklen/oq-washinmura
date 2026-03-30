import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

const DEFAULT_DB_PATH = "./data/oq.db";

export function getDb(path?: string): Database {
  const dbPath = path ?? process.env.DB_PATH ?? DEFAULT_DB_PATH;

  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'oq',
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oq_profiles (
      id INTEGER PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id),
      oq_value INTEGER NOT NULL,
      oq_token TEXT UNIQUE,
      level INTEGER,
      contactable INTEGER DEFAULT 1,
      tokens_monthly INTEGER,
      api_cost_monthly REAL,
      battle_record TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      email TEXT,
      code TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY,
      from_user_id INTEGER REFERENCES users(id),
      to_oq_id INTEGER REFERENCES oq_profiles(id),
      message TEXT,
      status TEXT DEFAULT 'sent',
      sent_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_oq_profiles_level
      ON oq_profiles(level);

    CREATE INDEX IF NOT EXISTS idx_oq_profiles_oq_value
      ON oq_profiles(oq_value DESC);

    CREATE INDEX IF NOT EXISTS idx_auth_codes_email
      ON auth_codes(email);

    CREATE INDEX IF NOT EXISTS idx_contacts_from_to
      ON contacts(from_user_id, to_oq_id);
  `);

  return db;
}
