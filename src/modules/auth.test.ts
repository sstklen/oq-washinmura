import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { jwtVerify } from "jose";
import { getDb } from "../db";
import { sendCode, verifyCode } from "./auth";

const databases: Database[] = [];

afterEach(() => {
  while (databases.length > 0) {
    const db = databases.pop();

    db?.close();
  }
});

function createTestDb(): Database {
  const db = getDb(":memory:");
  databases.push(db);
  return db;
}

function getAuthCode(db: Database, email: string) {
  return db
    .query("SELECT email, code, expires_at FROM auth_codes WHERE email = ?")
    .get(email) as
    | {
        email: string;
        code: string;
        expires_at: string;
      }
    | null;
}

function getUserByEmail(db: Database, email: string) {
  return db
    .query("SELECT id, email, last_login_at FROM users WHERE email = ?")
    .get(email) as
    | {
        id: number;
        email: string;
        last_login_at: string;
      }
    | null;
}

const jwtSecret = new TextEncoder().encode("test-secret");

process.env.JWT_SECRET = "test-secret";

describe("sendCode", () => {
  test("stores a six-digit code with a future expiration", async () => {
    const db = createTestDb();

    await sendCode(db, "test@example.com");

    const row = getAuthCode(db, "test@example.com");

    expect(row).toBeTruthy();
    expect(row?.code).toMatch(/^\d{6}$/);
    expect(Date.parse(row!.expires_at)).toBeGreaterThan(Date.now());
  });

  test("normalizes the email before saving", async () => {
    const db = createTestDb();

    await sendCode(db, "  TEST@Example.COM  ");

    const row = getAuthCode(db, "test@example.com");

    expect(row?.email).toBe("test@example.com");
  });

  test("replaces any existing code for the same email", async () => {
    const db = createTestDb();

    db.query("INSERT INTO auth_codes (email, code, expires_at) VALUES (?, ?, ?)")
      .run("test@x.com", "111111", new Date(Date.now() + 60_000).toISOString());

    await sendCode(db, "test@x.com");

    const rows = db
      .query("SELECT code FROM auth_codes WHERE email = ?")
      .all("test@x.com") as Array<{ code: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).not.toBe("111111");
  });
});

describe("verifyCode", () => {
  test("returns a token, creates a user, and clears the used code", async () => {
    const db = createTestDb();

    await sendCode(db, "fresh@example.com");
    const authCode = getAuthCode(db, "fresh@example.com");

    const result = await verifyCode(db, "fresh@example.com", authCode!.code);
    const tokenPayload = await jwtVerify(result.token, jwtSecret, {
      algorithms: ["HS256"],
    });
    const userRow = getUserByEmail(db, "fresh@example.com");
    const remainingCode = getAuthCode(db, "fresh@example.com");

    expect(result.user.email).toBe("fresh@example.com");
    expect(typeof result.token).toBe("string");
    expect(userRow?.id).toBe(result.user.id);
    expect(result.user.id).toBeGreaterThan(0);
    expect(tokenPayload.payload.user_id).toBe(result.user.id);
    expect(tokenPayload.payload.email).toBe("fresh@example.com");
    expect(remainingCode).toBeNull();
  });

  test("throws invalid_code when the code does not match", async () => {
    const db = createTestDb();

    await sendCode(db, "wrong@example.com");

    await expect(verifyCode(db, "wrong@example.com", "000000")).rejects.toThrow("invalid_code");
  });

  test("throws code_expired when the stored code is expired", async () => {
    const db = createTestDb();

    db.query("INSERT INTO auth_codes (email, code, expires_at) VALUES (?, ?, ?)")
      .run("expired@example.com", "123456", new Date(Date.now() - 60_000).toISOString());

    await expect(verifyCode(db, "expired@example.com", "123456")).rejects.toThrow("code_expired");
  });

  test("updates last_login_at for an existing user", async () => {
    const db = createTestDb();
    const previousLoginAt = "2000-01-01T00:00:00.000Z";

    db.query("INSERT INTO users (email, last_login_at) VALUES (?, ?)")
      .run("returning@example.com", previousLoginAt);

    await sendCode(db, "returning@example.com");
    const authCode = getAuthCode(db, "returning@example.com");

    const result = await verifyCode(db, "returning@example.com", authCode!.code);
    const userRow = getUserByEmail(db, "returning@example.com");

    expect(result.user.id).toBe(userRow!.id);
    expect(Date.parse(userRow!.last_login_at)).toBeGreaterThan(Date.parse(previousLoginAt));
  });
});
