import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getDb } from "../db";
import { createAuthRoutes } from "./auth";

const databases: Database[] = [];

process.env.JWT_SECRET = "test-secret";

afterEach(() => {
  while (databases.length > 0) {
    const db = databases.pop();

    db?.close();
  }
});

function createTestApp() {
  const db = getDb(":memory:");
  const app = new Hono();

  databases.push(db);
  app.route("/api/auth", createAuthRoutes(db));

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

describe("createAuthRoutes", () => {
  test("POST /api/auth/send-code returns ok for a valid email", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/auth/send-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("POST /api/auth/send-code rejects an invalid email", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/auth/send-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "not-email",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_email" });
  });

  test("POST /api/auth/verify returns a token and user for a correct code", async () => {
    const { app, db } = createTestApp();

    await app.request("/api/auth/send-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
      }),
    });

    const response = await app.request("/api/auth/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
        code: getStoredCode(db, "test@example.com"),
      }),
    });

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe("test@example.com");
  });

  test("POST /api/auth/verify returns invalid_code for a wrong code", async () => {
    const { app } = createTestApp();

    await app.request("/api/auth/send-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
      }),
    });

    const response = await app.request("/api/auth/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
        code: "000000",
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_code" });
  });
});
