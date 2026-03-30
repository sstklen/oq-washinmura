import type { Database } from "bun:sqlite";

export type BattleRecord = {
  bash: number;
  commits: number;
  edits: number;
  agents: number;
  web: number;
  total: number;
};

export type SubmitOqInput = {
  oq_value?: number;
  tokens_monthly?: number;
  api_cost_monthly?: number;
  battle_record?: BattleRecord | null;
};

export type UpdateOqInput = {
  userId?: number;
  oq_token?: string;
  oq_value?: number;
  tokens_monthly?: number;
  api_cost_monthly?: number;
  battle_record?: BattleRecord | null;
};

export type UpdateSettingsInput = {
  display_name?: string;
  contactable?: boolean;
};

export type OqProfileSummary = {
  oq_value: number;
  level: number;
  display_name: string | null;
  tokens_monthly: number;
  api_cost_monthly: number;
  battle_record: BattleRecord | null;
};

export type OqSettingsSummary = {
  display_name: string | null;
  contactable: boolean;
};

type StoredOqProfileRow = {
  id: number;
  user_id: number;
  oq_token: string | null;
  oq_value: number;
  level: number;
  display_name: string | null;
  contactable: number;
  tokens_monthly: number;
  api_cost_monthly: number;
  battle_record: string | null;
};

import { HTML_TAG_PATTERN, hasField } from "../constants";

export function calculateLevel(tokensMonthly: number): number {
  const dailyAverage = tokensMonthly / 30;

  if (dailyAverage <= 1_000_000) {
    return 1;
  }

  if (dailyAverage <= 10_000_000) {
    return 2;
  }

  if (dailyAverage <= 50_000_000) {
    return 3;
  }

  if (dailyAverage <= 200_000_000) {
    return 4;
  }

  if (dailyAverage <= 1_000_000_000) {
    return 5;
  }

  return 6;
}

function generateOqToken(): string {
  return `oq_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function hasExistingProfile(db: Database, userId: number): boolean {
  const row = db
    .query("SELECT id FROM oq_profiles WHERE user_id = ?")
    .get(userId) as { id: number } | null;

  return row !== null;
}

function getUserDisplayName(db: Database, userId: number): string | null {
  const row = db
    .query("SELECT display_name FROM users WHERE id = ?")
    .get(userId) as { display_name: string | null } | null;

  if (!row) {
    throw new Error("user_not_found");
  }

  return row.display_name;
}

function getProfileByUserId(db: Database, userId: number): StoredOqProfileRow | null {
  return db
    .query(`
      SELECT
        oq_profiles.id,
        oq_profiles.user_id,
        oq_profiles.oq_token,
        oq_profiles.oq_value,
        COALESCE(oq_profiles.level, 1) AS level,
        users.display_name,
        COALESCE(oq_profiles.contactable, 1) AS contactable,
        COALESCE(oq_profiles.tokens_monthly, 0) AS tokens_monthly,
        COALESCE(oq_profiles.api_cost_monthly, 0) AS api_cost_monthly,
        oq_profiles.battle_record
      FROM oq_profiles
      JOIN users ON users.id = oq_profiles.user_id
      WHERE oq_profiles.user_id = ?
    `)
    .get(userId) as StoredOqProfileRow | null;
}

function getProfileByToken(db: Database, oqToken: string): StoredOqProfileRow | null {
  return db
    .query(`
      SELECT
        oq_profiles.id,
        oq_profiles.user_id,
        oq_profiles.oq_token,
        oq_profiles.oq_value,
        COALESCE(oq_profiles.level, 1) AS level,
        users.display_name,
        COALESCE(oq_profiles.contactable, 1) AS contactable,
        COALESCE(oq_profiles.tokens_monthly, 0) AS tokens_monthly,
        COALESCE(oq_profiles.api_cost_monthly, 0) AS api_cost_monthly,
        oq_profiles.battle_record
      FROM oq_profiles
      JOIN users ON users.id = oq_profiles.user_id
      WHERE oq_profiles.oq_token = ?
    `)
    .get(oqToken) as StoredOqProfileRow | null;
}

function parseBattleRecord(value: string | null): BattleRecord | null {
  if (value === null) {
    return null;
  }

  return JSON.parse(value) as BattleRecord;
}

function validateOptionalOqFields(data: UpdateOqInput) {
  if (
    hasField(data,"oq_value") &&
    (!Number.isInteger(data.oq_value) || (data.oq_value ?? 0) <= 0)
  ) {
    throw new Error("invalid_oq_value");
  }

  if (
    hasField(data,"tokens_monthly") &&
    (!Number.isInteger(data.tokens_monthly) || (data.tokens_monthly ?? 0) < 0)
  ) {
    throw new Error("invalid_tokens_monthly");
  }

  if (
    hasField(data,"api_cost_monthly") &&
    (typeof data.api_cost_monthly !== "number" ||
      Number.isNaN(data.api_cost_monthly) ||
      data.api_cost_monthly < 0)
  ) {
    throw new Error("invalid_api_cost_monthly");
  }

  if (
    hasField(data,"battle_record") &&
    data.battle_record !== null &&
    data.battle_record !== undefined &&
    typeof data.battle_record !== "object"
  ) {
    throw new Error("invalid_battle_record");
  }
}

function validateDisplayName(displayName: string) {
  if (displayName.length === 0) {
    throw new Error("display_name_empty");
  }

  if (displayName.length > 30) {
    throw new Error("display_name_too_long");
  }

  if (HTML_TAG_PATTERN.test(displayName)) {
    throw new Error("display_name_invalid");
  }

  // 擋 XSS event handler 注入（onmouseover= 等）
  if (/on\w+\s*=/i.test(displayName)) {
    throw new Error("display_name_invalid");
  }
}

function validateSubmission(data: SubmitOqInput): {
  oq_value: number;
  tokens_monthly: number;
  api_cost_monthly: number;
  battle_record: BattleRecord | null;
} {
  if (
    typeof data.oq_value !== "number" ||
    typeof data.tokens_monthly !== "number" ||
    typeof data.api_cost_monthly !== "number"
  ) {
    throw new Error("missing_fields");
  }

  if (!Number.isInteger(data.oq_value) || data.oq_value <= 0) {
    throw new Error("invalid_oq_value");
  }

  if (!Number.isInteger(data.tokens_monthly) || data.tokens_monthly < 0) {
    throw new Error("invalid_tokens_monthly");
  }

  if (Number.isNaN(data.api_cost_monthly) || data.api_cost_monthly < 0) {
    throw new Error("invalid_api_cost_monthly");
  }

  if (
    data.battle_record !== undefined &&
    data.battle_record !== null &&
    typeof data.battle_record !== "object"
  ) {
    throw new Error("invalid_battle_record");
  }

  return {
    oq_value: data.oq_value,
    tokens_monthly: data.tokens_monthly,
    api_cost_monthly: data.api_cost_monthly,
    battle_record: data.battle_record ?? null,
  };
}

export function submitOq(
  db: Database,
  userId: number,
  data: SubmitOqInput,
): { oq_token: string; profile: OqProfileSummary } {
  if (hasExistingProfile(db, userId)) {
    throw new Error("already_submitted");
  }

  const validated = validateSubmission(data);
  const displayName = getUserDisplayName(db, userId);
  const level = calculateLevel(validated.tokens_monthly);
  const oqToken = generateOqToken();

  db.query(`
    INSERT INTO oq_profiles (
      user_id,
      oq_value,
      oq_token,
      level,
      tokens_monthly,
      api_cost_monthly,
      battle_record
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    validated.oq_value,
    oqToken,
    level,
    validated.tokens_monthly,
    validated.api_cost_monthly,
    validated.battle_record === null ? null : JSON.stringify(validated.battle_record),
  );

  return {
    oq_token: oqToken,
    profile: {
      oq_value: validated.oq_value,
      level,
      display_name: displayName,
      tokens_monthly: validated.tokens_monthly,
      api_cost_monthly: validated.api_cost_monthly,
      battle_record: validated.battle_record,
    },
  };
}

export function updateOq(db: Database, data: UpdateOqInput): OqProfileSummary {
  if (typeof data.userId !== "number" && typeof data.oq_token !== "string") {
    throw new Error("unauthorized");
  }

  validateOptionalOqFields(data);

  const existingProfile =
    typeof data.userId === "number"
      ? getProfileByUserId(db, data.userId)
      : getProfileByToken(db, data.oq_token as string);

  if (!existingProfile) {
    throw new Error("oq_not_found");
  }

  const nextOqValue = hasField(data,"oq_value")
    ? (data.oq_value as number)
    : existingProfile.oq_value;
  const nextTokensMonthly = hasField(data,"tokens_monthly")
    ? (data.tokens_monthly as number)
    : existingProfile.tokens_monthly;
  const nextApiCostMonthly = hasField(data,"api_cost_monthly")
    ? (data.api_cost_monthly as number)
    : existingProfile.api_cost_monthly;
  const nextBattleRecord = hasField(data,"battle_record")
    ? (data.battle_record ?? null)
    : parseBattleRecord(existingProfile.battle_record);
  const nextLevel = calculateLevel(nextTokensMonthly);

  db.query(`
    UPDATE oq_profiles
    SET
      oq_value = ?,
      tokens_monthly = ?,
      api_cost_monthly = ?,
      battle_record = ?,
      level = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nextOqValue,
    nextTokensMonthly,
    nextApiCostMonthly,
    nextBattleRecord === null ? null : JSON.stringify(nextBattleRecord),
    nextLevel,
    existingProfile.id,
  );

  return {
    oq_value: nextOqValue,
    level: nextLevel,
    display_name: existingProfile.display_name,
    tokens_monthly: nextTokensMonthly,
    api_cost_monthly: nextApiCostMonthly,
    battle_record: nextBattleRecord,
  };
}

export function updateSettings(
  db: Database,
  userId: number,
  data: UpdateSettingsInput,
): OqSettingsSummary {
  const hasDisplayName = hasField(data,"display_name");
  const hasContactable = hasField(data,"contactable");

  if (!hasDisplayName && !hasContactable) {
    throw new Error("no_fields");
  }

  if (hasDisplayName && typeof data.display_name !== "string") {
    throw new Error("display_name_empty");
  }

  if (hasDisplayName) {
    validateDisplayName(data.display_name as string);
  }

  if (hasContactable && typeof data.contactable !== "boolean") {
    throw new Error("no_fields");
  }

  const userRow = db
    .query(`
      SELECT
        users.display_name,
        oq_profiles.id AS oq_id,
        COALESCE(oq_profiles.contactable, 1) AS contactable
      FROM users
      LEFT JOIN oq_profiles ON oq_profiles.user_id = users.id
      WHERE users.id = ?
    `)
    .get(userId) as { display_name: string | null; oq_id: number | null; contactable: number } | null;

  if (!userRow) {
    throw new Error("user_not_found");
  }

  if (!userRow.oq_id) {
    throw new Error("oq_not_found");
  }

  db.transaction(() => {
    if (hasDisplayName) {
      db.query("UPDATE users SET display_name = ? WHERE id = ?").run(data.display_name, userId);
    }

    if (hasContactable) {
      db.query("UPDATE oq_profiles SET contactable = ? WHERE user_id = ?")
        .run(data.contactable ? 1 : 0, userId);
    }

    // display_name 或 contactable 任一變動都更新 updated_at（SPEC-06）
    db.query("UPDATE oq_profiles SET updated_at = datetime('now') WHERE user_id = ?").run(userId);
  })();

  return {
    display_name: hasDisplayName ? (data.display_name as string) : userRow.display_name,
    contactable: hasContactable ? (data.contactable as boolean) : userRow.contactable === 1,
  };
}
