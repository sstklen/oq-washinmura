import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { jwtVerify } from "jose";
import { authGuard } from "../middleware/auth-guard";
import { getJwtSecretKey } from "../modules/auth";
import {
  submitOq,
  updateOq,
  updateSettings,
  type SubmitOqInput,
  type UpdateOqInput,
  type UpdateSettingsInput,
} from "../modules/oq";

const badRequestErrors = new Set([
  "missing_fields",
  "invalid_oq_value",
  "invalid_tokens_monthly",
  "invalid_api_cost_monthly",
  "invalid_battle_record",
  "display_name_too_long",
  "display_name_empty",
  "display_name_invalid",
  "no_fields",
  "invalid_contactable",
  "invalid_fingerprint",
]);

import { LEVEL_TITLES, parsePositiveInt } from "../constants";

const MAX_DISPLAY_NAME_LENGTH = 50;

export function createOqRoutes(db: Database): Hono<{ Variables: { userId: number } }> {
  const app = new Hono<{ Variables: { userId: number } }>();

  // SPEC-12: 單人 OQ 查詢（公開，不需登入）
  app.get("/profile/:oqId", (c) => {
    const oqId = parsePositiveInt(c.req.param("oqId"));

    if (oqId === null) {
      return c.json({ error: "invalid_oq_id" }, 400);
    }

    const row = db.query(
      `SELECT
          oq_profiles.id AS oq_id,
          COALESCE(users.display_name, 'Anonymous') AS display_name,
          oq_profiles.oq_value,
          COALESCE(oq_profiles.level, 1) AS level,
          oq_profiles.tokens_monthly,
          oq_profiles.battle_record,
          oq_profiles.updated_at
       FROM oq_profiles
       INNER JOIN users ON users.id = oq_profiles.user_id
       WHERE oq_profiles.id = ?`,
    ).get(oqId) as { oq_id: number; display_name: string; oq_value: number; level: number; tokens_monthly: number; battle_record: string; updated_at: string } | null;

    if (!row) {
      return c.json({ error: "oq_not_found" }, 404);
    }

    return c.json({
      profile: {
        oq_id: row.oq_id,
        display_name: row.display_name ?? "Anonymous",
        oq_value: row.oq_value,
        level: row.level,
        level_title: LEVEL_TITLES[row.level ?? 0] ?? "",
        tokens_monthly: row.tokens_monthly,
        battle_record: row.battle_record ? (() => { try { return JSON.parse(row.battle_record as string); } catch { return row.battle_record; } })() : null,
        updated_at: row.updated_at,
      },
    });
  });

  // GET /me — 登入用戶查自己的 profile（不需要知道 oq_id）
  app.get("/me", authGuard, (c) => {
    const userId = c.get("userId");

    const row = db.query(
      `SELECT
          oq_profiles.id AS oq_id,
          oq_profiles.oq_token,
          COALESCE(users.display_name, 'Anonymous') AS display_name,
          oq_profiles.oq_value,
          COALESCE(oq_profiles.level, 1) AS level,
          oq_profiles.oq_type,
          oq_profiles.tokens_monthly,
          oq_profiles.api_cost_monthly,
          oq_profiles.battle_record,
          oq_profiles.fingerprint,
          COALESCE(oq_profiles.contactable, 1) AS contactable,
          oq_profiles.updated_at
       FROM oq_profiles
       INNER JOIN users ON users.id = oq_profiles.user_id
       WHERE oq_profiles.user_id = ?`,
    ).get(userId) as {
      oq_id: number; oq_token: string | null; display_name: string;
      oq_value: number; level: number; oq_type: string | null;
      tokens_monthly: number; api_cost_monthly: number;
      battle_record: string | null; fingerprint: string | null;
      contactable: number; updated_at: string | null;
    } | null;

    if (!row) {
      return c.json({ error: "oq_not_found", hint: "use POST /api/oq/submit first" }, 404);
    }

    return c.json({
      profile: {
        oq_id: row.oq_id,
        oq_token: row.oq_token,
        display_name: row.display_name,
        oq_value: row.oq_value,
        level: row.level,
        level_title: LEVEL_TITLES[row.level] ?? "",
        oq_type: row.oq_type,
        tokens_monthly: row.tokens_monthly,
        api_cost_monthly: row.api_cost_monthly,
        battle_record: row.battle_record ? (() => { try { return JSON.parse(row.battle_record as string); } catch { return row.battle_record; } })() : null,
        fingerprint: row.fingerprint ? (() => { try { return JSON.parse(row.fingerprint as string); } catch { return null; } })() : null,
        contactable: row.contactable === 1,
        updated_at: row.updated_at,
      },
    });
  });

  app.post("/submit", authGuard, async (c) => {
    const body = await c.req.json<SubmitOqInput & { display_name?: unknown }>();

    try {
      const displayName = validateDisplayName(body.display_name);
      db.query("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, c.get("userId"));

      const result = submitOq(db, c.get("userId"), body);
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "already_submitted") {
          return c.json({ error: error.message }, 409);
        }

        if (error.message === "display_name_too_long") {
          return c.json({ error: error.message, max: MAX_DISPLAY_NAME_LENGTH }, 400);
        }

        if (badRequestErrors.has(error.message)) {
          return c.json({ error: error.message }, 400);
        }
      }

      throw error;
    }
  });

  app.put("/update", async (c) => {
    const body = await c.req.json<UpdateOqInput>();
    const authorization = c.req.header("authorization");

    try {
      // 安全：userId 只能從 JWT 取，不能從 body 傳入（防 IDOR）
      const userId = await resolveUserIdFromAuthorization(authorization);
      const profile = updateOq(db, {
        ...body,
        userId: userId ?? undefined,
      });

      return c.json({ profile });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "unauthorized") {
          return c.json({ error: error.message }, 401);
        }

        if (error.message === "oq_not_found") {
          return c.json({ error: error.message, hint: "use POST /api/oq/submit first" }, 404);
        }

        if (error.message === "user_not_found") {
          return c.json({ error: error.message }, 404);
        }

        if (badRequestErrors.has(error.message)) {
          return c.json({ error: error.message }, 400);
        }
      }

      throw error;
    }
  });

  app.put("/settings", authGuard, async (c) => {
    const body = await c.req.json<UpdateSettingsInput>();

    try {
      const settings = updateSettings(db, c.get("userId"), body);
      return c.json({ settings });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "oq_not_found") {
          return c.json({ error: error.message, hint: "use POST /api/oq/submit first" }, 404);
        }

        if (error.message === "user_not_found") {
          return c.json({ error: error.message }, 404);
        }

        if (error.message === "display_name_too_long") {
          return c.json({ error: error.message, max: 30 }, 400);
        }

        if (badRequestErrors.has(error.message)) {
          return c.json({ error: error.message }, 400);
        }
      }

      throw error;
    }
  });

  return app;
}

function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("display_name_empty");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("display_name_empty");
  }

  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error("display_name_too_long");
  }

  if (/<[^>]*>/.test(trimmed) || /on\w+\s*=/i.test(trimmed)) {
    throw new Error("display_name_invalid");
  }

  return trimmed;
}

async function resolveUserIdFromAuthorization(
  authorization: string | undefined,
): Promise<number | null> {
  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    throw new Error("unauthorized");
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.user_id !== "number") {
      throw new Error("unauthorized");
    }

    return payload.user_id;
  } catch {
    throw new Error("unauthorized");
  }
}
