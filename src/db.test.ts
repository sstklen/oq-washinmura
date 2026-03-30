import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { getDb } from "./db";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "oq-db-test-"));
  tempDirs.push(dir);
  return join(dir, "nested", "oq.db");
}

describe("getDb", () => {
  test("opens an in-memory database without throwing", () => {
    const db = getDb(":memory:");

    try {
      expect(db).toBeDefined();
    } finally {
      db.close();
    }
  });

  test("creates all required tables", () => {
    const db = getDb(":memory:");

    try {
      const rows = db
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      const tableNames = rows.map((row) => row.name);

      expect(tableNames).toEqual(
        expect.arrayContaining(["users", "oq_profiles", "auth_codes", "contacts"]),
      );
    } finally {
      db.close();
    }
  });

  test("creates all required indexes", () => {
    const db = getDb(":memory:");

    try {
      const rows = db
        .query("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Array<{ name: string }>;
      const indexNames = rows.map((row) => row.name);

      expect(indexNames).toEqual(
        expect.arrayContaining([
          "idx_oq_profiles_level",
          "idx_oq_profiles_oq_value",
          "idx_auth_codes_email",
          "idx_contacts_from_to",
        ]),
      );
    } finally {
      db.close();
    }
  });

  test("enables foreign key constraints", () => {
    const db = getDb(":memory:");

    try {
      const row = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(row.foreign_keys).toBe(1);
    } finally {
      db.close();
    }
  });

  test("uses WAL mode for file-backed databases and creates the parent directory", () => {
    const dbPath = makeTempDbPath();
    const db = getDb(dbPath);

    try {
      const row = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
      expect(row.journal_mode).toBe("wal");
      expect(existsSync(dirname(dbPath))).toBe(true);
    } finally {
      db.close();
    }
  });

  test("sets created_at when inserting a user with only email", () => {
    const db = getDb(":memory:");

    try {
      const result = db.query("INSERT INTO users (email) VALUES (?)").run("user@example.com");
      const row = db.query("SELECT created_at FROM users WHERE id = ?").get(result.lastInsertRowid) as {
        created_at: string | null;
      };

      expect(row.created_at).toBeTruthy();
    } finally {
      db.close();
    }
  });

  test("enforces the oq_profiles foreign key constraint", () => {
    const db = getDb(":memory:");

    try {
      expect(() =>
        db.query("INSERT INTO oq_profiles (user_id, oq_value) VALUES (?, ?)").run(99999, 42),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});
