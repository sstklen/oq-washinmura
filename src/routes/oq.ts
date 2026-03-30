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
]);

const LEVEL_TITLES: Record<number, string> = {
  1: "實習生 Intern",
  2: "獨立開發者 Solo Dev",
  3: "資深工程師 Senior Engineer",
  4: "一人公司 One-Person Co.",
  5: "一人科技公司 Solo Tech Co.",
  6: "矽谷新創規格 SV Startup Tier",
};

export function createOqRoutes(db: Database): Hono<{ Variables: { userId: number } }> {
  const app = new Hono<{ Variables: { userId: number } }>();

  // SPEC-12: 單人 OQ 查詢（公開，不需登入）
  app.get("/profile/:oqId", (c) => {
    const oqIdStr = c.req.param("oqId");
    const oqId = Number.parseInt(oqIdStr, 10);

    if (Number.isNaN(oqId) || oqId < 1) {
      return c.json({ error: "invalid_oq_id" }, 400);
    }

    const row = db.query(
      `SELECT
          oq_profiles.id AS oq_id,
          COALESCE(users.display_name, 'Anonymous') AS display_name,
          oq_profiles.oq_value,
          oq_profiles.level,
          oq_profiles.tokens_monthly,
          oq_profiles.battle_record,
          oq_profiles.updated_at
       FROM oq_profiles
       INNER JOIN users ON users.id = oq_profiles.user_id
       WHERE oq_profiles.id = ?`,
    ).get(oqId) as { oq_id: number; display_name: string | null; oq_value: number; level: number | null; tokens_monthly: number | null; battle_record: string | null; updated_at: string | null } | null;

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
        battle_record: row.battle_record,
        updated_at: row.updated_at,
      },
    });
  });

  app.post("/submit", authGuard, async (c) => {
    const body = await c.req.json<SubmitOqInput>();

    try {
      const result = submitOq(db, c.get("userId"), body);
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "already_submitted") {
          return c.json({ error: error.message }, 409);
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
      const userId = await resolveUserIdFromAuthorization(authorization);
      const profile = updateOq(db, {
        ...body,
        userId: userId ?? body.userId,
      });

      return c.json({ profile });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "unauthorized") {
          return c.json({ error: error.message }, 401);
        }

        if (error.message === "oq_not_found" || error.message === "user_not_found") {
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
        if (error.message === "oq_not_found" || error.message === "user_not_found") {
          return c.json({ error: error.message }, 404);
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
