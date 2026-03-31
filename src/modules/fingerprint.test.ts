import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { getDb } from "../db";
import {
  classifyOqType,
  getFingerprint,
  matchFingerprints,
  submitFingerprint,
  type OqScores,
} from "./fingerprint";

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

function createScores(overrides: Partial<OqScores> = {}): OqScores {
  return {
    vision: 6,
    standards: 6,
    delegation: 6,
    taste: 6,
    systems: 6,
    content: 6,
    tech: 6,
    influence: 6,
    design: 6,
    multilingual: 6,
    crisis: 6,
    risk: 6,
    ...overrides,
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

describe("classifyOqType", () => {
  test("returns 統御型 when vision, standards, delegation are high and content is low", () => {
    const scores = createScores({
      vision: 8,
      standards: 8,
      delegation: 8,
      content: 4,
      tech: 6,
    });

    expect(classifyOqType(scores)).toBe("統御型");
  });

  test("returns 放大型 when content, design, influence are high and vision is low", () => {
    const scores = createScores({
      vision: 5,
      content: 8,
      design: 7,
      influence: 7,
    });

    expect(classifyOqType(scores)).toBe("放大型");
  });

  test("returns 防守型 when tech, crisis, risk are high and content is very low", () => {
    const scores = createScores({
      content: 3,
      tech: 8,
      crisis: 8,
      risk: 8,
    });

    expect(classifyOqType(scores)).toBe("防守型");
  });

  test("returns 全能型 when at least 9 dimensions are 7 or above", () => {
    const scores = createScores({
      vision: 7,
      standards: 7,
      delegation: 7,
      taste: 7,
      systems: 7,
      content: 7,
      tech: 7,
      influence: 7,
      design: 7,
      multilingual: 7,
      crisis: 5,
      risk: 5,
    });

    expect(classifyOqType(scores)).toBe("全能型");
  });

  test("returns 混合型 when no rule matches", () => {
    const scores = createScores({
      vision: 7,
      standards: 7,
      delegation: 6,
      content: 5,
      tech: 7,
      influence: 6,
      design: 6,
      crisis: 6,
      risk: 6,
    });

    expect(classifyOqType(scores)).toBe("混合型");
  });
});

describe("submitFingerprint", () => {
  test("inserts a new fingerprint and classifies oq_type automatically", () => {
    const db = createTestDb();
    const scores = createScores({
      vision: 8,
      standards: 8,
      delegation: 8,
      content: 4,
    });

    const result = submitFingerprint(db, {
      anonymous_id: "anon-001",
      scores,
    });
    const fingerprint = getFingerprint(db, result.id);

    expect(result).toEqual({
      id: expect.any(Number),
      oq_type: "統御型",
    });
    expect(fingerprint).toMatchObject({
      id: result.id,
      anonymous_id: "anon-001",
      scores,
      oq_type: "統御型",
    });
  });

  test("updates the existing fingerprint when anonymous_id already exists", () => {
    const db = createTestDb();
    const first = submitFingerprint(db, {
      anonymous_id: "anon-dup",
      scores: createScores({
        vision: 8,
        standards: 8,
        delegation: 8,
        content: 4,
      }),
    });
    const nextScores = createScores({
      vision: 5,
      content: 8,
      design: 7,
      influence: 7,
    });

    const updated = submitFingerprint(db, {
      anonymous_id: "anon-dup",
      scores: nextScores,
      oq_type: "放大型",
    });
    const fingerprint = getFingerprint(db, first.id);

    expect(updated).toEqual({
      id: first.id,
      oq_type: "放大型",
    });
    expect(fingerprint).toMatchObject({
      id: first.id,
      anonymous_id: "anon-dup",
      scores: nextScores,
      oq_type: "放大型",
    });
  });
});

describe("getFingerprint", () => {
  test("returns the stored fingerprint when the id exists", () => {
    const db = createTestDb();
    const scores = createScores({
      tech: 8,
      crisis: 8,
      risk: 8,
      content: 3,
    });
    const created = submitFingerprint(db, {
      anonymous_id: "anon-get",
      scores,
    });

    expect(getFingerprint(db, created.id)).toMatchObject({
      id: created.id,
      anonymous_id: "anon-get",
      scores,
      oq_type: "防守型",
    });
  });

  test("returns null when the id does not exist", () => {
    const db = createTestDb();

    expect(getFingerprint(db, 999)).toBeNull();
  });
});

describe("matchFingerprints", () => {
  test("returns matches sorted by complement_score and marks perfect matches", () => {
    const db = createTestDb();
    const source = submitFingerprint(db, {
      anonymous_id: "anon-source",
      scores: createUniformScores(2),
      oq_type: "architect",
    });

    submitFingerprint(db, {
      anonymous_id: "anon-top",
      scores: createUniformScores(8),
      oq_type: "operator",
    });
    submitFingerprint(db, {
      anonymous_id: "anon-second",
      scores: createUniformScores(6, { risk: 5 }),
      oq_type: "builder",
    });

    expect(matchFingerprints(db, source.id)).toEqual([
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

  test("throws fingerprint_not_found when the id does not exist", () => {
    const db = createTestDb();

    expect(() => matchFingerprints(db, 999)).toThrow("fingerprint_not_found");
  });
});
