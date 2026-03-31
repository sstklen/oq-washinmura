import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getDb } from "../db";
import type { OqScores } from "../modules/fingerprint";
import { createFingerprintRoutes } from "./fingerprint";

const databases: Database[] = [];

afterEach(() => {
  while (databases.length > 0) {
    const db = databases.pop();

    db?.close();
  }
});

function createScores() {
  return {
    vision: 8,
    standards: 8,
    delegation: 8,
    taste: 6,
    systems: 6,
    content: 4,
    tech: 6,
    influence: 6,
    design: 6,
    multilingual: 6,
    crisis: 6,
    risk: 6,
  };
}

function createUniformScores(value: number, overrides: Partial<OqScores> = {}): OqScores {
  return {
    vision: value,
    standards: value,
    delegation: value,
    taste: value,
    systems: value,
    content: value,
    tech: value,
    influence: value,
    design: value,
    multilingual: value,
    crisis: value,
    risk: value,
    ...overrides,
  };
}

function insertFingerprint(
  db: Database,
  anonymousId: string,
  oqType: string,
  scores: OqScores,
): number {
  const result = db.query(`
    INSERT INTO oq_fingerprints (anonymous_id, scores, oq_type)
    VALUES (?, ?, ?)
  `).run(anonymousId, JSON.stringify(scores), oqType);

  return Number(result.lastInsertRowid);
}

function createTestApp() {
  const db = getDb(":memory:");
  const app = new Hono();

  databases.push(db);
  app.route("/api/oq/fingerprint", createFingerprintRoutes(db));

  return { app, db };
}

describe("createFingerprintRoutes", () => {
  test("POST /api/oq/fingerprint/submit returns 201 for a valid payload", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/oq/fingerprint/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        anonymous_id: "anon-route-001",
        scores: createScores(),
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: expect.any(Number),
      oq_type: "統御型",
    });
  });

  test("POST /api/oq/fingerprint/submit returns 400 when anonymous_id is missing", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/oq/fingerprint/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        scores: createScores(),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "missing_fields" });
  });

  test("GET /api/oq/fingerprint/:id returns 200 when the fingerprint exists", async () => {
    const { app, db } = createTestApp();
    const result = db.query(`
      INSERT INTO oq_fingerprints (anonymous_id, scores, oq_type)
      VALUES (?, ?, ?)
    `).run(
      "anon-route-002",
      JSON.stringify(createScores()),
      "統御型",
    );
    const id = Number(result.lastInsertRowid);
    const response = await app.request(`/api/oq/fingerprint/${id}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      fingerprint: {
        id,
        anonymous_id: "anon-route-002",
        scores: createScores(),
        oq_type: "統御型",
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    });
  });

  test("GET /api/oq/fingerprint/:id returns 404 when the fingerprint does not exist", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/oq/fingerprint/999");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "fingerprint_not_found" });
  });

  test("GET /api/oq/fingerprint/match/1 returns 200 with matches", async () => {
    const { app, db } = createTestApp();
    insertFingerprint(db, "anon-source", "architect", createUniformScores(2));
    insertFingerprint(db, "anon-top", "operator", createUniformScores(8));
    insertFingerprint(db, "anon-second", "builder", createUniformScores(6, { risk: 5 }));

    const response = await app.request("/api/oq/fingerprint/match/1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.matches).toEqual([
      {
        id: 2,
        anonymous_id: "anon-top",
        oq_type: "operator",
        complement_score: 8,
        is_perfect: true,
      },
      {
        id: 3,
        anonymous_id: "anon-second",
        oq_type: "builder",
        complement_score: 5.92,
        is_perfect: false,
      },
    ]);
  });

  test("GET /api/oq/fingerprint/match/999 returns 404", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/oq/fingerprint/match/999");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "fingerprint_not_found" });
  });
});
