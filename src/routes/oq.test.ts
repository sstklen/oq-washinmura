import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getDb } from "../db";
import { createAuthRoutes } from "./auth";
import { createOqRoutes } from "./oq";

const databases: Database[] = [];
type TestApp = Hono<{ Variables: { userId: number } }>;

process.env.JWT_SECRET = "test-secret";

afterEach(() => {
  while (databases.length > 0) {
    const db = databases.pop();

    db?.close();
  }
});

function createTestApp() {
  const db = getDb(":memory:");
  const app: TestApp = new Hono<{ Variables: { userId: number } }>();

  databases.push(db);
  app.route("/api/auth", createAuthRoutes(db));
  app.route("/api/oq", createOqRoutes(db));

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

async function createJwt(app: TestApp, db: Database, email = "oq-route@example.com"): Promise<string> {
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

async function submitProfile(
  app: TestApp,
  token: string,
  body?: Record<string, unknown>,
): Promise<{ oq_token: string; profile: { level: number } }> {
  const response = await app.request("/api/oq/submit", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(
      body ?? {
        oq_value: 85_200,
        tokens_monthly: 892_000_000,
        api_cost_monthly: 3_550,
        battle_record: {
          bash: 12_450,
          commits: 340,
          edits: 5_600,
          agents: 890,
          web: 320,
          total: 19_600,
        },
      },
    ),
  });

  return await response.json();
}

describe("createOqRoutes", () => {
  test("POST /api/oq/submit returns 201 and oq_token for a valid JWT", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db);

    const response = await app.request("/api/oq/submit", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        oq_value: 85_200,
        tokens_monthly: 892_000_000,
        api_cost_monthly: 3_550,
        battle_record: {
          bash: 12_450,
          commits: 340,
          edits: 5_600,
          agents: 890,
          web: 320,
          total: 19_600,
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.oq_token).toMatch(/^oq_[a-f0-9]{12}$/);
    expect(body.profile.level).toBe(3);
  });

  test("POST /api/oq/submit returns 401 without JWT", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/oq/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        oq_value: 85_200,
        tokens_monthly: 892_000_000,
        api_cost_monthly: 3_550,
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("POST /api/oq/submit returns 409 for a duplicate submission", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db, "duplicate@example.com");
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const body = JSON.stringify({
      oq_value: 85_200,
      tokens_monthly: 892_000_000,
      api_cost_monthly: 3_550,
      battle_record: {
        bash: 12_450,
        commits: 340,
        edits: 5_600,
        agents: 890,
        web: 320,
        total: 19_600,
      },
    });

    await app.request("/api/oq/submit", {
      method: "POST",
      headers,
      body,
    });

    const response = await app.request("/api/oq/submit", {
      method: "POST",
      headers,
      body,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_submitted" });
  });

  test("POST /api/oq/submit returns 400 when oq_value is zero", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db, "invalid-value@example.com");

    const response = await app.request("/api/oq/submit", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        oq_value: 0,
        tokens_monthly: 0,
        api_cost_monthly: 0,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_oq_value" });
  });

  test("PUT /api/oq/update returns 200 when updating by oq_token", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db, "update-token@example.com");
    const submitted = await submitProfile(app, token);

    const response = await app.request("/api/oq/update", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        oq_token: submitted.oq_token,
        oq_value: 92_000,
        tokens_monthly: 1_200_000_000,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile).toMatchObject({
      oq_value: 92_000,
      level: 3,
      tokens_monthly: 1_200_000_000,
    });
  });

  test("PUT /api/oq/update returns 200 and prefers Authorization over oq_token body", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db, "update-auth@example.com");
    await submitProfile(app, token);

    const strangerToken = await createJwt(app, db, "stranger@example.com");
    const strangerProfile = await submitProfile(app, strangerToken, {
      oq_value: 50_000,
      tokens_monthly: 60_000_000,
      api_cost_monthly: 200,
    });

    const response = await app.request("/api/oq/update", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        oq_token: strangerProfile.oq_token,
        oq_value: 80_000,
      }),
    });
    const body = await response.json();
    const ownRow = db
      .query("SELECT oq_value FROM oq_profiles WHERE oq_value = 80_000")
      .all() as Array<{ oq_value: number }>;

    expect(response.status).toBe(200);
    expect(body.profile.oq_value).toBe(80_000);
    expect(ownRow).toHaveLength(1);
  });

  test("PUT /api/oq/update returns 401 without JWT or oq_token", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/oq/update", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        oq_value: 92_000,
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("PUT /api/oq/settings returns 200 for an authenticated update", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db, "settings-route@example.com");
    await submitProfile(app, token);

    const response = await app.request("/api/oq/settings", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        display_name: "test",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings).toEqual({
      display_name: "test",
      contactable: true,
    });
  });

  test("PUT /api/oq/settings returns 400 when display_name is too long", async () => {
    const { app, db } = createTestApp();
    const token = await createJwt(app, db, "settings-route-long@example.com");
    await submitProfile(app, token);

    const response = await app.request("/api/oq/settings", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        display_name: "1234567890123456789012345678901",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "display_name_too_long" });
  });
});
