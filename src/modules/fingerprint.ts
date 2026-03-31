import type { Database } from "bun:sqlite";
import { OQ_TYPES } from "../constants";
import { normalizeOqType } from "./oq";

const OQ_SCORE_KEYS = [
  "vision",
  "standards",
  "delegation",
  "taste",
  "systems",
  "content",
  "tech",
  "influence",
  "design",
  "multilingual",
  "crisis",
  "risk",
] as const;

export type OqScores = {
  vision: number;
  standards: number;
  delegation: number;
  taste: number;
  systems: number;
  content: number;
  tech: number;
  influence: number;
  design: number;
  multilingual: number;
  crisis: number;
  risk: number;
};

type OqScoreKey = (typeof OQ_SCORE_KEYS)[number];

type SubmitFingerprintInput = {
  anonymous_id?: string;
  scores?: OqScores;
  oq_type?: string;
};

type StoredFingerprintRow = {
  id: number;
  anonymous_id: string;
  scores: string;
  oq_type: string;
  created_at: string;
  updated_at: string;
};

export type OqFingerprintRecord = {
  id: number;
  anonymous_id: string;
  scores: OqScores;
  oq_type: string;
  created_at: string;
  updated_at: string;
};

export type MatchResult = {
  id: number;
  anonymous_id: string;
  oq_type: string;
  complement_score: number;
  is_perfect: boolean;
};

export function ensureFingerprintTable(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oq_fingerprints (
      id INTEGER PRIMARY KEY,
      anonymous_id TEXT NOT NULL,
      scores TEXT NOT NULL,
      oq_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function isValidScores(value: unknown): value is OqScores {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return OQ_SCORE_KEYS.every((key) => {
    const score = (value as Record<OqScoreKey, unknown>)[key];
    return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10;
  });
}

function validateSubmitFingerprintInput(data: SubmitFingerprintInput): {
  anonymous_id: string;
  scores: OqScores;
  oq_type?: string;
} {
  if (typeof data.anonymous_id !== "string" || data.anonymous_id.trim().length === 0) {
    throw new Error("missing_fields");
  }

  if (data.anonymous_id.trim().length > 200) {
    throw new Error("anonymous_id_too_long");
  }

  if (!isValidScores(data.scores)) {
    throw new Error("invalid_scores");
  }

  let normalizedOqType: string | undefined;
  if (data.oq_type !== undefined) {
    if (typeof data.oq_type !== "string" || data.oq_type.length === 0) {
      throw new Error("invalid_oq_type");
    }
    const resolved = normalizeOqType(data.oq_type);
    if (!resolved) {
      throw new Error("invalid_oq_type");
    }
    normalizedOqType = resolved;
  }

  return {
    anonymous_id: data.anonymous_id.trim(),
    scores: data.scores,
    oq_type: normalizedOqType,
  };
}

function parseStoredScores(value: string): OqScores {
  const parsed = JSON.parse(value) as unknown;

  if (!isValidScores(parsed)) {
    throw new Error("invalid_scores");
  }

  return parsed;
}

function toFingerprintRecord(row: StoredFingerprintRow): OqFingerprintRecord {
  return {
    id: row.id,
    anonymous_id: row.anonymous_id,
    scores: parseStoredScores(row.scores),
    oq_type: row.oq_type,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateComplementScore(source: OqScores, target: OqScores): number {
  let total = 0;

  for (const key of OQ_SCORE_KEYS) {
    total += Math.max(source[key], target[key]);
  }

  return roundToTwoDecimals(total / OQ_SCORE_KEYS.length);
}

function isPerfectMatch(source: OqScores, target: OqScores): boolean {
  return OQ_SCORE_KEYS.every((key) => source[key] + target[key] >= 8);
}

export function classifyOqType(scores: OqScores): string {
  if (
    scores.vision >= 8 &&
    scores.standards >= 8 &&
    scores.delegation >= 8 &&
    (scores.content <= 4 || scores.tech <= 4)
  ) {
    return "統御型";
  }

  if (
    scores.content >= 8 &&
    scores.design >= 7 &&
    scores.influence >= 7 &&
    scores.vision <= 5
  ) {
    return "放大型";
  }

  if (
    scores.tech >= 8 &&
    scores.crisis >= 8 &&
    scores.risk >= 8 &&
    scores.content <= 3
  ) {
    return "防守型";
  }

  const strongDimensions = OQ_SCORE_KEYS.filter((key) => scores[key] >= 7).length;

  if (strongDimensions >= 9) {
    return "全能型";
  }

  return "混合型";
}

export function submitFingerprint(
  db: Database,
  data: SubmitFingerprintInput,
): { id: number; oq_type: string } {

  const validated = validateSubmitFingerprintInput(data);
  const oqType = validated.oq_type ?? classifyOqType(validated.scores);
  const existing = db
    .query("SELECT id FROM oq_fingerprints WHERE anonymous_id = ?")
    .get(validated.anonymous_id) as { id: number } | null;

  if (existing) {
    db.query(`
      UPDATE oq_fingerprints
      SET
        scores = ?,
        oq_type = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(validated.scores), oqType, existing.id);

    return {
      id: existing.id,
      oq_type: oqType,
    };
  }

  const result = db.query(`
    INSERT INTO oq_fingerprints (anonymous_id, scores, oq_type)
    VALUES (?, ?, ?)
  `).run(validated.anonymous_id, JSON.stringify(validated.scores), oqType);

  return {
    id: Number(result.lastInsertRowid),
    oq_type: oqType,
  };
}

export function getFingerprint(db: Database, id: number): OqFingerprintRecord | null {

  const row = db
    .query(`
      SELECT id, anonymous_id, scores, oq_type, created_at, updated_at
      FROM oq_fingerprints
      WHERE id = ?
    `)
    .get(id) as StoredFingerprintRow | null;

  if (!row) {
    return null;
  }

  return toFingerprintRecord(row);
}

export function matchFingerprints(db: Database, id: number, limit = 5): MatchResult[] {

  const source = getFingerprint(db, id);

  if (!source) {
    throw new Error("fingerprint_not_found");
  }

  if (limit <= 0) {
    return [];
  }

  // 限制掃描量：最多 1000 筆（按最近更新排序，優先匹配活躍用戶）
  const MAX_SCAN = 1000;
  const rows = db
    .query(`
      SELECT id, anonymous_id, scores, oq_type, created_at, updated_at
      FROM oq_fingerprints
      WHERE id != ?
      ORDER BY updated_at DESC
      LIMIT ?
    `)
    .all(id, MAX_SCAN) as StoredFingerprintRow[];

  return rows
    .map((row) => {
      const target = toFingerprintRecord(row);

      return {
        id: target.id,
        anonymous_id: target.anonymous_id,
        oq_type: target.oq_type,
        complement_score: calculateComplementScore(source.scores, target.scores),
        is_perfect: isPerfectMatch(source.scores, target.scores),
      };
    })
    .sort((left, right) =>
      right.complement_score - left.complement_score || left.id - right.id,
    )
    .slice(0, limit);
}
