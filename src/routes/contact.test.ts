import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getDb } from "../db";
import { setEmailSender } from "../modules/email";
import { createAuthRoutes } from "./auth";
import { createContactRoutes } from "./contact";

const databases: Database[] = [];
type TestApp = Hono<{ Variables: { userId: number } }>;

process.env.JWT_SECRET = "test-secret";

afterEach(() => {
  setEmailSender(null);

  while (databases.length > 0) {
    const db = databases.pop();

    db?.close();
  }
});

function createTestApp() {
  const db = getDb(":memory:");
  const app: TestApp = new Hono<{ Variables: { userId: number } }>();

  setEmailSender(async () => {});
  databases.push(db);
  app.route("/api/auth", createAuthRoutes(db));
  app.route("/api/contact", createContactRoutes(db));

  return { app, db };
}

function getStoredCode(db: Database, email: string): string {
  const row = db
    .query("SELECT code FROM auth_codes WHERE email = ?")
    .get(email) as { code: string } | null;

  if (!row) {
    throw new Error("missing_code");
  }

  return row.code;
}

async function createJwt(app: TestApp, db: Database, email = "from@example.com"): Promise<string> {
  await app.request("/api/auth/send-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const response = await app.request("/api/auth/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      code: getStoredCode(db, email),
    }),
  });
  const body = await response.json();

  return body.token;
}

function createTargetProfile(db: Database, contactable = 1): void {
  const userResult = db
    .query("INSERT INTO users (email) VALUES (?)")
    .run("target@example.com");
  const userId = Number(userResult.lastInsertRowid);

  db.query(`
    INSERT INTO oq_profiles (
      id,
      user_id,
      oq_value,
      oq_token,
      level,
      contactable,
      tokens_monthly,
      api_cost_monthly
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, userId, 75_000, "oq_target", 2, contactable, 120_000_000, 300);
}

describe("createContactRoutes", () => {
  test("POST /api/contact/3 returns 200 for an authenticated contact", async () => {
    const { app, db } = createTestApp();

    createTargetProfile(db, 1);
    const token = await createJwt(app, db);
    const response = await app.request("/api/contact/3", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "想合作",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, message: "已發送聯絡信" });
  });

  test("POST /api/contact/3 returns 401 without JWT", async () => {
    const { app, db } = createTestApp();

    createTargetProfile(db, 1);
    const response = await app.request("/api/contact/3", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "想合作",
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("POST /api/contact/999 returns 404 when the oq does not exist", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db);
    const response = await app.request("/api/contact/999", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "想合作",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "oq_not_found" });
  });

  test("POST /api/contact/3 returns 403 when the target is not contactable", async () => {
    const { app, db } = createTestApp();

    createTargetProfile(db, 0);
    const token = await createJwt(app, db);
    const response = await app.request("/api/contact/3", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "想合作",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_contactable" });
  });
});
