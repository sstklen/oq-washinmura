import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { LEVEL_TITLES } from "../constants";
import { normalizeOqType } from "../modules/oq";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_TOP_CONTRIBUTORS_LIMIT = 10;
const MAX_TOP_CONTRIBUTORS_LIMIT = 100;

type LeaderboardRow = {
  battle_record: string | null;
  display_name: string | null;
  level: number | null;
  oq_id: number;
  oq_type: string | null;
  oq_value: number;
  tokens_monthly: number | null;
  updated_at: string | null;
};

export type TopContributor = {
  user_id: number;
  oq_id: number;
  display_name: string;
  total_edits: number;
  total_commits: number;
  total_contribution: number;
};

type TopContributorRow = {
  user_id: number;
  oq_id: number;
  display_name: string;
  total_edits: number;
  total_commits: number;
};

function parseInteger(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeLimit(value: string | undefined): number {
  const parsed = parseInteger(value);

  if (parsed === null || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function normalizePage(value: string | undefined): number {
  const parsed = parseInteger(value);

  if (parsed === null || parsed < 1) {
    return DEFAULT_PAGE;
  }

  return parsed;
}

function parseLevels(value: string | undefined): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 6);
}

function parseOqTypes(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const oqTypes = value.split(",").reduce<string[]>((result, part) => {
    const oqType = normalizeOqType(part);

    if (oqType !== null) {
      result.push(oqType);
    }

    return result;
  }, []);

  return Array.from(new Set(oqTypes));
}

function buildWhereClause(levels: number[], min: number | null, max: number | null, oqTypes: string[], search?: string) {
  const clauses: string[] = [];
  const params: Array<number | string> = [];

  if (levels.length > 0) {
    clauses.push(`oq_profiles.level IN (${levels.map(() => "?").join(", ")})`);
    params.push(...levels);
  }

  if (min !== null) {
    clauses.push("oq_profiles.oq_value >= ?");
    params.push(min);
  }

  if (max !== null) {
    clauses.push("oq_profiles.oq_value <= ?");
    params.push(max);
  }

  if (oqTypes.length > 0) {
    clauses.push(`oq_profiles.oq_type IN (${oqTypes.map(() => "?").join(", ")})`);
    params.push(...oqTypes);
  }

  if (search && search.trim().length > 0) {
    clauses.push("users.display_name LIKE ?");
    params.push(`%${search.trim()}%`);
  }

  return {
    params,
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
  };
}

export function getTopContributors(db: Database, limit: number): TopContributor[] {
  if (!Number.isInteger(limit) || limit < 1) {
    return [];
  }

  const normalizedLimit = Math.min(limit, MAX_TOP_CONTRIBUTORS_LIMIT);

  const rows = db.query(`
    SELECT
      users.id AS user_id,
      COALESCE(users.display_name, 'Anonymous') AS display_name,
      oq_profiles.id AS oq_id,
      CASE
        WHEN json_valid(oq_profiles.battle_record) THEN COALESCE(
          CAST(json_extract(oq_profiles.battle_record, '$.edits') AS INTEGER),
          0
        )
        ELSE 0
      END AS total_edits,
      CASE
        WHEN json_valid(oq_profiles.battle_record) THEN COALESCE(
          CAST(json_extract(oq_profiles.battle_record, '$.commits') AS INTEGER),
          0
        )
        ELSE 0
      END AS total_commits
    FROM oq_profiles
    INNER JOIN users ON users.id = oq_profiles.user_id
    ORDER BY (total_edits + total_commits) DESC, oq_profiles.id ASC
    LIMIT ?
  `).all(normalizedLimit) as TopContributorRow[];

  return rows.map((row) => ({
    ...row,
    total_contribution: row.total_edits + row.total_commits,
  }));
}

export type ApiStats = {
  total_users: number;
  total_submissions: number;
  avg_oq_score: number;
};

export function getApiStats(db: Database): ApiStats {
  const row = db.query(`
    SELECT
      COUNT(*) AS total_submissions,
      COUNT(DISTINCT users.id) AS total_users,
      COALESCE(AVG(oq_profiles.oq_value), 0) AS avg_oq_score
    FROM oq_profiles
    INNER JOIN users ON users.id = oq_profiles.user_id
  `).get() as ApiStats;

  return {
    total_users: row.total_users,
    total_submissions: row.total_submissions,
    avg_oq_score: row.avg_oq_score,
  };
}

export function createLeaderboardRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const levelQuery = c.req.query("level");
    const oqTypeQuery = c.req.query("oq_type");
    const min = parseInteger(c.req.query("min"));
    const max = parseInteger(c.req.query("max"));
    const limit = normalizeLimit(c.req.query("limit"));
    const page = normalizePage(c.req.query("page"));

    if (min !== null && max !== null && min > max) {
      return c.json({ error: "invalid_range" }, 400);
    }

    // SPEC-05: page/limit 有值但非正整數 → 400（包含非數字如 "abc"）
    const rawPage = c.req.query("page");
    const rawLimit = c.req.query("limit");
    if ((rawPage !== undefined && (parseInteger(rawPage) === null || parseInteger(rawPage)! < 1)) ||
        (rawLimit !== undefined && (parseInteger(rawLimit) === null || parseInteger(rawLimit)! < 1))) {
      return c.json({ error: "invalid_pagination" }, 400);
    }

    const levels = parseLevels(levelQuery);

    // level 有值但全部無效（不在 1-6 範圍）→ 400
    if (levelQuery !== undefined && levelQuery !== "" && levels.length === 0) {
      return c.json({ error: "invalid_level" }, 400);
    }

    const search = c.req.query("search");
    const oqTypes = parseOqTypes(oqTypeQuery);
    const { params, sql: whereClause } = buildWhereClause(levels, min, max, oqTypes, search);
    const offset = (page - 1) * limit;

    const countQuery = db.query(
      `SELECT COUNT(*) AS total
       FROM oq_profiles
       INNER JOIN users ON users.id = oq_profiles.user_id
       ${whereClause}`,
    );
    const countRow = countQuery.get(...params) as { total: number };
    const total = countRow.total;
    const pages = total === 0 ? 0 : Math.ceil(total / limit);

    const leaderboardQuery = db.query(
      `SELECT
          oq_profiles.id AS oq_id,
          COALESCE(users.display_name, 'Anonymous') AS display_name,
          oq_profiles.oq_value,
          COALESCE(oq_profiles.level, 1) AS level,
          oq_profiles.oq_type,
          oq_profiles.tokens_monthly,
          oq_profiles.battle_record,
          oq_profiles.updated_at
       FROM oq_profiles
       INNER JOIN users ON users.id = oq_profiles.user_id
       ${whereClause}
       ORDER BY oq_profiles.oq_value DESC, oq_profiles.id ASC
       LIMIT ? OFFSET ?`,
    );
    const rows = leaderboardQuery.all(...params, limit, offset) as LeaderboardRow[];

    return c.json({
      leaderboard: rows.map((row) => ({
        oq_id: row.oq_id,
        display_name: row.display_name ?? "Anonymous",
        oq_value: row.oq_value,
        level: row.level,
        level_title: LEVEL_TITLES[row.level ?? 0] ?? "",
        oq_type: row.oq_type,
        tokens_monthly: row.tokens_monthly,
        battle_record: parseBattleRecordSafe(row.battle_record),
        updated_at: row.updated_at,
      })),
      pagination: {
        total,
        page,
        pages,
        limit,
      },
    });
  });

  // GET /stats — 社群概覽統計
  app.get("/stats", (c) => {
    const summary = db.query(`
      SELECT
        COUNT(*) AS total_users,
        COALESCE(AVG(oq_value), 0) AS avg_oq,
        COALESCE(MAX(oq_value), 0) AS max_oq,
        COALESCE(MIN(oq_value), 0) AS min_oq
      FROM oq_profiles
      INNER JOIN users ON users.id = oq_profiles.user_id
    `).get() as { total_users: number; avg_oq: number; max_oq: number; min_oq: number };

    const levelRows = db.query(`
      SELECT COALESCE(level, 1) AS level, COUNT(*) AS count
      FROM oq_profiles
      GROUP BY COALESCE(level, 1)
      ORDER BY level ASC
    `).all() as Array<{ level: number; count: number }>;

    const typeRows = db.query(`
      SELECT oq_type, COUNT(*) AS count
      FROM oq_profiles
      WHERE oq_type IS NOT NULL
      GROUP BY oq_type
      ORDER BY count DESC
    `).all() as Array<{ oq_type: string; count: number }>;

    const byLevel: Record<string, number> = {};
    for (const row of levelRows) {
      byLevel[String(row.level)] = row.count;
    }

    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.oq_type] = row.count;
    }

    return c.json({
      stats: {
        total_users: summary.total_users,
        avg_oq: Math.round(summary.avg_oq),
        max_oq: summary.max_oq,
        min_oq: summary.min_oq,
        by_level: byLevel,
        by_type: byType,
      },
    });
  });

  return app;
}

function parseBattleRecordSafe(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}
