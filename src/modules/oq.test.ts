import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { getDb } from "../db";
import { calculateLevel, submitOq, updateOq, updateSettings } from "./oq";

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

function createUser(db: Database, email = "oq@example.com", displayName?: string | null): number {
  const result = db
    .query("INSERT INTO users (email, display_name) VALUES (?, ?)")
    .run(email, displayName ?? null);
  return Number(result.lastInsertRowid);
}

function getProfileRow(db: Database, userId: number) {
  return db
    .query(`
      SELECT oq_token, oq_value, level, contactable, tokens_monthly, api_cost_monthly, battle_record
      FROM oq_profiles
      WHERE user_id = ?
    `)
    .get(userId) as
    | {
        oq_token: string;
        oq_value: number;
        level: number;
        contactable: number;
        tokens_monthly: number;
        api_cost_monthly: number;
        battle_record: string | null;
      }
    | null;
}

const levelCases: Array<[number, number]> = [
  [0, 1],
  [29_999_999, 1],
  [30_000_000, 1],
  [30_000_001, 2],
  [300_000_000, 2],
  [300_000_001, 3],
  [1_500_000_000, 3],
  [1_500_000_001, 4],
  [6_000_000_000, 4],
  [6_000_000_001, 5],
  [30_000_000_000, 5],
  [30_000_000_001, 6],
];

describe("calculateLevel", () => {
  for (const [tokensMonthly, expectedLevel] of levelCases) {
    test(`returns level ${expectedLevel} for ${tokensMonthly} monthly tokens`, () => {
      expect(calculateLevel(tokensMonthly)).toBe(expectedLevel);
    });
  }
});

describe("submitOq", () => {
  test("returns an oq_token and profile for a valid submission", () => {
    const db = createTestDb();
    const userId = createUser(db);

    const result = submitOq(db, userId, {
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
    const row = db
      .query(`
        SELECT oq_token, oq_value, level, tokens_monthly, api_cost_monthly, battle_record
        FROM oq_profiles
        WHERE user_id = ?
      `)
      .get(userId) as
      | {
          oq_token: string;
          oq_value: number;
          level: number;
          tokens_monthly: number;
          api_cost_monthly: number;
          battle_record: string;
        }
      | null;

    expect(result.oq_token).toMatch(/^oq_[a-f0-9]{12}$/);
    expect(result.profile).toEqual({
      oq_value: 85_200,
      level: 3,
      display_name: null,
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
    expect(row).toBeTruthy();
    expect(row?.oq_token).toBe(result.oq_token);
    expect(row?.oq_value).toBe(85_200);
    expect(row?.level).toBe(3);
    expect(row?.tokens_monthly).toBe(892_000_000);
    expect(row?.api_cost_monthly).toBe(3_550);
    expect(row?.battle_record).toBe(
      JSON.stringify({
        bash: 12_450,
        commits: 340,
        edits: 5_600,
        agents: 890,
        web: 320,
        total: 19_600,
      }),
    );
  });

  test("throws already_submitted when the user already has an oq profile", () => {
    const db = createTestDb();
    const userId = createUser(db);

    submitOq(db, userId, {
      oq_value: 85_200,
      tokens_monthly: 892_000_000,
      api_cost_monthly: 3_550,
      battle_record: null,
    });

    expect(() =>
      submitOq(db, userId, {
        oq_value: 90_000,
        tokens_monthly: 900_000_000,
        api_cost_monthly: 3_600,
        battle_record: null,
      }),
    ).toThrow("already_submitted");
  });

  test("throws invalid_oq_value when oq_value is zero or negative", () => {
    const db = createTestDb();
    const userId = createUser(db);

    expect(() =>
      submitOq(db, userId, {
        oq_value: 0,
        tokens_monthly: 0,
        api_cost_monthly: 0,
        battle_record: null,
      }),
    ).toThrow("invalid_oq_value");
  });

  test("throws missing_fields when oq_value is missing", () => {
    const db = createTestDb();
    const userId = createUser(db);

    expect(() =>
      submitOq(db, userId, {
        tokens_monthly: 0,
        api_cost_monthly: 0,
      }),
    ).toThrow("missing_fields");
  });

  test("stores a null battle_record when it is omitted", () => {
    const db = createTestDb();
    const userId = createUser(db);

    const result = submitOq(db, userId, {
      oq_value: 500,
      tokens_monthly: 0,
      api_cost_monthly: 0,
    });
    const row = db
      .query("SELECT battle_record, level FROM oq_profiles WHERE user_id = ?")
      .get(userId) as { battle_record: string | null; level: number } | null;

    expect(result.profile.level).toBe(1);
    expect(result.profile.battle_record).toBeNull();
    expect(row).toEqual({
      battle_record: null,
      level: 1,
    });
  });
});

describe("updateOq", () => {
  test("updates oq by oq_token and recalculates level", () => {
    const db = createTestDb();
    const userId = createUser(db);
    const submitted = submitOq(db, userId, {
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

    const profile = updateOq(db, {
      oq_token: submitted.oq_token,
      oq_value: 92_000,
      tokens_monthly: 1_200_000_000,
    });
    const row = getProfileRow(db, userId);

    expect(profile).toEqual({
      oq_value: 92_000,
      level: 3,
      display_name: null,
      tokens_monthly: 1_200_000_000,
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
    expect(row).toMatchObject({
      oq_token: submitted.oq_token,
      oq_value: 92_000,
      level: 3,
      tokens_monthly: 1_200_000_000,
      api_cost_monthly: 3_550,
    });
  });

  test("updates oq by userId", () => {
    const db = createTestDb();
    const userId = createUser(db);

    submitOq(db, userId, {
      oq_value: 85_200,
      tokens_monthly: 892_000_000,
      api_cost_monthly: 3_550,
      battle_record: null,
    });

    const profile = updateOq(db, {
      userId,
      oq_value: 80_000,
    });
    const row = getProfileRow(db, userId);

    expect(profile.oq_value).toBe(80_000);
    expect(profile.level).toBe(3);
    expect(row?.oq_value).toBe(80_000);
  });

  test("keeps existing fields when partially updating", () => {
    const db = createTestDb();
    const userId = createUser(db);

    submitOq(db, userId, {
      oq_value: 85_200,
      tokens_monthly: 892_000_000,
      api_cost_monthly: 3_550,
      battle_record: null,
    });

    const profile = updateOq(db, {
      userId,
      oq_value: 91_000,
    });
    const row = getProfileRow(db, userId);

    expect(profile.tokens_monthly).toBe(892_000_000);
    expect(profile.api_cost_monthly).toBe(3_550);
    expect(row?.tokens_monthly).toBe(892_000_000);
    expect(row?.api_cost_monthly).toBe(3_550);
  });

  test("throws oq_not_found when oq_token does not exist", () => {
    const db = createTestDb();

    expect(() =>
      updateOq(db, {
        oq_token: "oq_missingtoken",
        oq_value: 92_000,
      }),
    ).toThrow("oq_not_found");
  });

  test("throws unauthorized when userId and oq_token are both missing", () => {
    const db = createTestDb();

    expect(() =>
      updateOq(db, {
        oq_value: 92_000,
      }),
    ).toThrow("unauthorized");
  });
});

describe("updateSettings", () => {
  test("updates display_name in users", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-name@example.com");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });

    const settings = updateSettings(db, userId, { display_name: "tkman" });
    const row = db
      .query(`
        SELECT users.display_name, oq_profiles.contactable
        FROM users
        JOIN oq_profiles ON oq_profiles.user_id = users.id
        WHERE users.id = ?
      `)
      .get(userId) as { display_name: string | null; contactable: number } | null;

    expect(settings).toEqual({
      display_name: "tkman",
      contactable: true,
    });
    expect(row).toEqual({
      display_name: "tkman",
      contactable: 1,
    });
  });

  test("updates contactable in oq_profiles", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-contact@example.com", "before");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });

    const settings = updateSettings(db, userId, { contactable: false });
    const row = db
      .query(`
        SELECT users.display_name, oq_profiles.contactable
        FROM users
        JOIN oq_profiles ON oq_profiles.user_id = users.id
        WHERE users.id = ?
      `)
      .get(userId) as { display_name: string | null; contactable: number } | null;

    expect(settings).toEqual({
      display_name: "before",
      contactable: false,
    });
    expect(row).toEqual({
      display_name: "before",
      contactable: 0,
    });
  });

  test("keeps contactable when only display_name is updated", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-keep@example.com");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });
    updateSettings(db, userId, { contactable: false });

    const settings = updateSettings(db, userId, { display_name: "tkman" });

    expect(settings).toEqual({
      display_name: "tkman",
      contactable: false,
    });
  });

  test("throws display_name_too_long when display_name exceeds 30 chars", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-long@example.com");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });

    expect(() =>
      updateSettings(db, userId, {
        display_name: "1234567890123456789012345678901",
      }),
    ).toThrow("display_name_too_long");
  });

  test("throws display_name_empty when display_name is empty", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-empty@example.com");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });

    expect(() =>
      updateSettings(db, userId, {
        display_name: "",
      }),
    ).toThrow("display_name_empty");
  });

  test("throws display_name_invalid when display_name contains HTML tags", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-html@example.com");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });

    expect(() =>
      updateSettings(db, userId, {
        display_name: "<script>alert(1)</script>",
      }),
    ).toThrow("display_name_invalid");
  });

  test("throws no_fields when request body is empty", () => {
    const db = createTestDb();
    const userId = createUser(db, "settings-no-fields@example.com");

    submitOq(db, userId, {
      oq_value: 70_000,
      tokens_monthly: 90_000_000,
      api_cost_monthly: 200,
      battle_record: null,
    });

    expect(() => updateSettings(db, userId, {})).toThrow("no_fields");
  });
});
