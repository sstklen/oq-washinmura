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

export function createOqRoutes(db: Database): Hono<{ Variables: { userId: number } }> {
  const app = new Hono<{ Variables: { userId: number } }>();

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
