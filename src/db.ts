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
  db.exec("PRAGMA busy_timeout = 5000;");
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
      fingerprint TEXT,
      oq_type TEXT,
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

    CREATE TABLE IF NOT EXISTS oq_fingerprints (
      id INTEGER PRIMARY KEY,
      anonymous_id TEXT UNIQUE NOT NULL,
      scores TEXT NOT NULL,
      oq_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_oq_profiles_level
      ON oq_profiles(level);

    CREATE INDEX IF NOT EXISTS idx_oq_profiles_oq_value
      ON oq_profiles(oq_value DESC);

    CREATE INDEX IF NOT EXISTS idx_auth_codes_email
      ON auth_codes(email);

    CREATE INDEX IF NOT EXISTS idx_contacts_from_to
      ON contacts(from_user_id, to_oq_id);

    CREATE INDEX IF NOT EXISTS idx_fingerprints_type
      ON oq_fingerprints(oq_type);

    CREATE INDEX IF NOT EXISTS idx_fingerprints_anon
      ON oq_fingerprints(anonymous_id);
  `);

  // 既有 DB migrate（duplicate column 忽略，其他錯誤 log）
  for (const col of ["fingerprint TEXT", "oq_type TEXT"]) {
    try { db.exec(`ALTER TABLE oq_profiles ADD COLUMN ${col}`); }
    catch (e) { if (!(e instanceof Error && e.message.includes("duplicate"))) console.error(`[db migrate] ${col}:`, e); }
  }

  db.exec(`
    UPDATE oq_profiles
    SET oq_type = CASE LOWER(oq_type)
      WHEN '統御型' THEN '統御型'
      WHEN 'commander' THEN '統御型'
      WHEN '放大型' THEN '放大型'
      WHEN 'amplifier' THEN '放大型'
      WHEN '防守型' THEN '防守型'
      WHEN 'defender' THEN '防守型'
      WHEN '全能型' THEN '全能型'
      WHEN 'allrounder' THEN '全能型'
      WHEN '混合型' THEN '混合型'
      WHEN 'hybrid' THEN '混合型'
      ELSE oq_type
    END
    WHERE oq_type IS NOT NULL;

    UPDATE oq_profiles
    SET oq_type = CASE LOWER(CAST(json_extract(fingerprint, '$.oq_type') AS TEXT))
      WHEN '統御型' THEN '統御型'
      WHEN 'commander' THEN '統御型'
      WHEN '放大型' THEN '放大型'
      WHEN 'amplifier' THEN '放大型'
      WHEN '防守型' THEN '防守型'
      WHEN 'defender' THEN '防守型'
      WHEN '全能型' THEN '全能型'
      WHEN 'allrounder' THEN '全能型'
      WHEN '混合型' THEN '混合型'
      WHEN 'hybrid' THEN '混合型'
      ELSE NULL
    END
    WHERE oq_type IS NULL
      AND fingerprint IS NOT NULL
      AND json_valid(fingerprint)
      AND json_extract(fingerprint, '$.oq_type') IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_oq_profiles_oq_type
      ON oq_profiles(oq_type);
  `);

  return db;
}
