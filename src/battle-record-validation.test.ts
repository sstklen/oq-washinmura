import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { validateBattleRecord, getLevelTitle } from "./constants";
import { getDb } from "./db";
import { submitOq, updateOq } from "./modules/oq";

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

function createUser(db: Database, email = "br-test@example.com"): number {
  const result = db
    .query("INSERT INTO users (email, display_name) VALUES (?, ?)")
    .run(email, null);
  return Number(result.lastInsertRowid);
}

describe("validateBattleRecord", () => {
  test("returns valid for a correct battle_record", () => {
    const result = validateBattleRecord({
      bash: 100,
      commits: 20,
      edits: 50,
      agents: 10,
      web: 20,
      total: 200,
    });
    expect(result).toEqual({ valid: true });
  });

  test("returns invalid when total does not match sum", () => {
    const result = validateBattleRecord({
      bash: 100,
      commits: 20,
      edits: 50,
      agents: 10,
      web: 20,
      total: 999,
    });
    expect(result).toEqual({ valid: false, reason: "battle_record_total_mismatch" });
  });

  test("returns invalid when a field is negative", () => {
    const result = validateBattleRecord({
      bash: -1,
      commits: 0,
      edits: 0,
      agents: 0,
      web: 0,
      total: -1,
    });
    expect(result).toEqual({ valid: false, reason: "battle_record_invalid_bash" });
  });

  test("returns invalid when a field is a float", () => {
    const result = validateBattleRecord({
      bash: 1.5,
      commits: 0,
      edits: 0,
      agents: 0,
      web: 0,
      total: 1.5,
    });
    expect(result).toEqual({ valid: false, reason: "battle_record_invalid_bash" });
  });

  test("returns invalid when value is not an object", () => {
    expect(validateBattleRecord("string")).toEqual({
      valid: false,
      reason: "battle_record_not_object",
    });
    expect(validateBattleRecord(null)).toEqual({
      valid: false,
      reason: "battle_record_not_object",
    });
    expect(validateBattleRecord([1, 2, 3])).toEqual({
      valid: false,
      reason: "battle_record_not_object",
    });
  });

  test("returns invalid when total field is missing", () => {
    const result = validateBattleRecord({
      bash: 1,
      commits: 2,
      edits: 3,
      agents: 4,
      web: 5,
    });
    expect(result).toEqual({ valid: false, reason: "battle_record_invalid_total" });
  });

  test("accepts all-zero battle_record", () => {
    const result = validateBattleRecord({
      bash: 0,
      commits: 0,
      edits: 0,
      agents: 0,
      web: 0,
      total: 0,
    });
    expect(result).toEqual({ valid: true });
  });
});

describe("getLevelTitle", () => {
  test("returns correct title for valid levels", () => {
    expect(getLevelTitle(1)).toBe("實習生 Intern");
    expect(getLevelTitle(6)).toBe("矽谷新創規格 SV Startup Tier");
  });

  test("returns null for invalid level", () => {
    expect(getLevelTitle(0)).toBeNull();
    expect(getLevelTitle(7)).toBeNull();
    expect(getLevelTitle(-1)).toBeNull();
  });
});

describe("submitOq with strict battle_record validation", () => {
  test("rejects battle_record with mismatched total", () => {
    const db = createTestDb();
    const userId = createUser(db, "br-mismatch@example.com");

    expect(() =>
      submitOq(db, userId, {
        oq_value: 1000,
        tokens_monthly: 100_000,
        api_cost_monthly: 10,
        battle_record: {
          bash: 10,
          commits: 5,
          edits: 3,
          agents: 2,
          web: 1,
          total: 999,
        },
      }),
    ).toThrow("battle_record_total_mismatch");
  });

  test("rejects battle_record with negative field", () => {
    const db = createTestDb();
    const userId = createUser(db, "br-negative@example.com");

    expect(() =>
      submitOq(db, userId, {
        oq_value: 1000,
        tokens_monthly: 100_000,
        api_cost_monthly: 10,
        battle_record: {
          bash: -5,
          commits: 5,
          edits: 3,
          agents: 2,
          web: 1,
          total: 6,
        },
      }),
    ).toThrow("battle_record_invalid_bash");
  });
});

describe("updateOq with strict battle_record validation", () => {
  test("rejects battle_record update with mismatched total", () => {
    const db = createTestDb();
    const userId = createUser(db, "br-update@example.com");

    const submitted = submitOq(db, userId, {
      oq_value: 1000,
      tokens_monthly: 100_000,
      api_cost_monthly: 10,
      battle_record: null,
    });

    expect(() =>
      updateOq(db, {
        oq_token: submitted.oq_token,
        battle_record: {
          bash: 10,
          commits: 5,
          edits: 3,
          agents: 2,
          web: 1,
          total: 0,
        },
      }),
    ).toThrow("battle_record_total_mismatch");
  });
});
