import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getDb } from "../db";
import { createLeaderboardRoutes } from "./leaderboard";

const databases: Database[] = [];

type ProfileSeed = {
  api_cost_monthly?: number;
  battle_record: string;
  contactable?: number;
  display_name: string | null;
  email: string;
  level: number;
  oq_type?: string | null;
  oq_token?: string;
  oq_value: number;
  tokens_monthly: number;
  updated_at: string;
};

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
  app.route("/leaderboard", createLeaderboardRoutes(db));

  return { app, db };
}

function seedProfiles(db: Database, profiles: ProfileSeed[]) {
  const insertUser = db.query(
    "INSERT INTO users (email, display_name, role) VALUES (?, ?, ?)",
  );
  const insertProfile = db.query(
    `INSERT INTO oq_profiles (
      user_id,
      oq_value,
      oq_token,
      level,
      contactable,
      tokens_monthly,
      api_cost_monthly,
      battle_record,
      oq_type,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const profile of profiles) {
    const userResult = insertUser.run(profile.email, profile.display_name, "oq");

    insertProfile.run(
      userResult.lastInsertRowid,
      profile.oq_value,
      profile.oq_token ?? `${profile.email}-token`,
      profile.level,
      profile.contactable ?? 1,
      profile.tokens_monthly,
      profile.api_cost_monthly ?? 0,
      profile.battle_record,
      profile.oq_type ?? null,
      profile.updated_at,
    );
  }
}

describe("createLeaderboardRoutes", () => {
  test("GET /leaderboard returns a sorted leaderboard with pagination and no email", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "alpha@example.com",
        display_name: "Alpha",
        oq_value: 90000,
        level: 6,
        tokens_monthly: 1200,
        battle_record: "12-1",
        updated_at: "2026-03-01T10:00:00.000Z",
      },
      {
        email: "beta@example.com",
        display_name: "Beta",
        oq_value: 50000,
        level: 4,
        tokens_monthly: 800,
        battle_record: "8-3",
        updated_at: "2026-03-02T10:00:00.000Z",
      },
      {
        email: "gamma@example.com",
        display_name: "Gamma",
        oq_value: 30000,
        level: 2,
        tokens_monthly: 400,
        battle_record: "3-5",
        updated_at: "2026-03-03T10:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaderboard).toHaveLength(3);
    expect(body.leaderboard.map((entry: { oq_value: number }) => entry.oq_value)).toEqual([
      90000,
      50000,
      30000,
    ]);
    expect(body.pagination).toEqual({
      total: 3,
      page: 1,
      pages: 1,
      limit: 50,
    });
    expect(body.leaderboard[0]).toEqual({
      oq_id: 1,
      display_name: "Alpha",
      oq_value: 90000,
      level: 6,
      level_title: "矽谷新創規格 SV Startup Tier",
      tokens_monthly: 1200,
      battle_record: "12-1",
      oq_type: null,
      updated_at: "2026-03-01T10:00:00.000Z",
    });
    expect(body.leaderboard[0].email).toBeUndefined();
  });

  test("GET /leaderboard filters by level and minimum oq_value", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "lv3@example.com",
        display_name: "Lv3",
        oq_value: 81000,
        level: 3,
        tokens_monthly: 100,
        battle_record: "3-0",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
      {
        email: "lv4@example.com",
        display_name: "Lv4",
        oq_value: 82000,
        level: 4,
        tokens_monthly: 200,
        battle_record: "4-0",
        updated_at: "2026-03-11T10:00:00.000Z",
      },
      {
        email: "lv5@example.com",
        display_name: "Lv5",
        oq_value: 83000,
        level: 5,
        tokens_monthly: 300,
        battle_record: "5-0",
        updated_at: "2026-03-12T10:00:00.000Z",
      },
      {
        email: "lv6@example.com",
        display_name: "Lv6",
        oq_value: 92000,
        level: 6,
        tokens_monthly: 400,
        battle_record: "6-0",
        updated_at: "2026-03-13T10:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard?level=5,6&min=80000");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaderboard).toHaveLength(2);
    expect(
      body.leaderboard.map((entry: { level: number; oq_value: number }) => ({
        level: entry.level,
        oq_value: entry.oq_value,
      })),
    ).toEqual([
      { level: 6, oq_value: 92000 },
      { level: 5, oq_value: 83000 },
    ]);
  });

  test("GET /leaderboard paginates with page and limit", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "user1@example.com",
        display_name: "User1",
        oq_value: 95000,
        level: 6,
        tokens_monthly: 100,
        battle_record: "1-0",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
      {
        email: "user2@example.com",
        display_name: "User2",
        oq_value: 85000,
        level: 5,
        tokens_monthly: 100,
        battle_record: "2-0",
        updated_at: "2026-03-02T00:00:00.000Z",
      },
      {
        email: "user3@example.com",
        display_name: "User3",
        oq_value: 75000,
        level: 4,
        tokens_monthly: 100,
        battle_record: "3-0",
        updated_at: "2026-03-03T00:00:00.000Z",
      },
      {
        email: "user4@example.com",
        display_name: "User4",
        oq_value: 65000,
        level: 3,
        tokens_monthly: 100,
        battle_record: "4-0",
        updated_at: "2026-03-04T00:00:00.000Z",
      },
      {
        email: "user5@example.com",
        display_name: "User5",
        oq_value: 55000,
        level: 2,
        tokens_monthly: 100,
        battle_record: "5-0",
        updated_at: "2026-03-05T00:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard?page=2&limit=2");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaderboard).toHaveLength(2);
    expect(body.leaderboard.map((entry: { display_name: string }) => entry.display_name)).toEqual([
      "User3",
      "User4",
    ]);
    expect(body.pagination).toEqual({
      total: 5,
      page: 2,
      pages: 3,
      limit: 2,
    });
  });

  test("GET /leaderboard handles empty results and boundary cases", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "anon@example.com",
        display_name: null,
        oq_value: 70000,
        level: 4,
        tokens_monthly: 250,
        battle_record: "7-0",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
    ]);

    const emptyResponse = await app.request("/leaderboard?level=6&min=90000");
    const emptyBody = await emptyResponse.json();

    expect(emptyResponse.status).toBe(200);
    expect(emptyBody).toEqual({
      leaderboard: [],
      pagination: {
        total: 0,
        page: 1,
        pages: 0,
        limit: 50,
      },
    });

    const cappedResponse = await app.request("/leaderboard?limit=999");
    const cappedBody = await cappedResponse.json();

    expect(cappedResponse.status).toBe(200);
    expect(cappedBody.pagination.limit).toBe(100);
    expect(cappedBody.leaderboard[0].display_name).toBe("Anonymous");

    const invalidRangeResponse = await app.request("/leaderboard?min=90000&max=80000");

    expect(invalidRangeResponse.status).toBe(400);
    expect(await invalidRangeResponse.json()).toEqual({ error: "invalid_range" });
  });

  test("GET /leaderboard never leaks email in the JSON payload", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "hidden@example.com",
        display_name: "Hidden",
        oq_value: 88000,
        level: 5,
        tokens_monthly: 600,
        battle_record: "8-1",
        updated_at: "2026-03-21T00:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard");
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text.includes("@")).toBe(false);
  });

  test("GET /leaderboard filters by a single oq_type", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "commander@example.com",
        display_name: "Commander",
        oq_value: 91000,
        level: 6,
        oq_type: "統御型",
        tokens_monthly: 1000,
        battle_record: "9-1",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      {
        email: "amplifier@example.com",
        display_name: "Amplifier",
        oq_value: 86000,
        level: 5,
        oq_type: "放大型",
        tokens_monthly: 900,
        battle_record: "8-2",
        updated_at: "2026-03-23T00:00:00.000Z",
      },
      {
        email: "legacy@example.com",
        display_name: "Legacy",
        oq_value: 83000,
        level: 5,
        oq_type: null,
        tokens_monthly: 800,
        battle_record: "7-3",
        updated_at: "2026-03-24T00:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard?oq_type=統御型");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard).toEqual([
      expect.objectContaining({
        display_name: "Commander",
        oq_type: "統御型",
      }),
    ]);
  });

  test("GET /leaderboard filters by multiple oq_type values", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "commander@example.com",
        display_name: "Commander",
        oq_value: 91000,
        level: 6,
        oq_type: "統御型",
        tokens_monthly: 1000,
        battle_record: "9-1",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      {
        email: "allrounder@example.com",
        display_name: "Allrounder",
        oq_value: 90000,
        level: 6,
        oq_type: "全能型",
        tokens_monthly: 990,
        battle_record: "9-0",
        updated_at: "2026-03-23T00:00:00.000Z",
      },
      {
        email: "defender@example.com",
        display_name: "Defender",
        oq_value: 88000,
        level: 5,
        oq_type: "防守型",
        tokens_monthly: 950,
        battle_record: "8-1",
        updated_at: "2026-03-24T00:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard?oq_type=統御型,全能型");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaderboard.map((entry: { display_name: string; oq_type: string | null }) => ({
      display_name: entry.display_name,
      oq_type: entry.oq_type,
    }))).toEqual([
      { display_name: "Commander", oq_type: "統御型" },
      { display_name: "Allrounder", oq_type: "全能型" },
    ]);
  });

  test("GET /leaderboard without oq_type filter returns all rows including null oq_type", async () => {
    const { app, db } = createTestApp();

    seedProfiles(db, [
      {
        email: "commander@example.com",
        display_name: "Commander",
        oq_value: 91000,
        level: 6,
        oq_type: "統御型",
        tokens_monthly: 1000,
        battle_record: "9-1",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      {
        email: "legacy@example.com",
        display_name: "Legacy",
        oq_value: 83000,
        level: 5,
        oq_type: null,
        tokens_monthly: 800,
        battle_record: "7-3",
        updated_at: "2026-03-24T00:00:00.000Z",
      },
    ]);

    const response = await app.request("/leaderboard");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaderboard.map((entry: { display_name: string; oq_type: string | null }) => ({
      display_name: entry.display_name,
      oq_type: entry.oq_type,
    }))).toEqual([
      { display_name: "Commander", oq_type: "統御型" },
      { display_name: "Legacy", oq_type: null },
    ]);
  });

  test("GET /leaderboard returns 400 for non-numeric page value", async () => {
    const { app } = createTestApp();

    const response = await app.request("/leaderboard?page=abc");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_pagination" });
  });

  test("GET /leaderboard returns 400 for level values outside the valid 1-6 range", async () => {
    const { app } = createTestApp();

    for (const level of ["0", "7", "-1", "99"]) {
      const response = await app.request(`/leaderboard?level=${level}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_level" });
    }
  });
});
