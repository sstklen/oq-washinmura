import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { parsePositiveInt } from "../constants";
import { authGuard } from "../middleware/auth-guard";
import { sendContact } from "../modules/contact";

type ContactRequestBody = {
  message?: string;
};

const badRequestErrors = new Set([
  "message_required",
  "message_too_long",
]);

const forbiddenErrors = new Set([
  "not_contactable",
]);

const contactBadRequestErrors = new Set([
  "cannot_contact_self",
]);

export function createContactRoutes(db: Database): Hono<{ Variables: { userId: number } }> {
  const app = new Hono<{ Variables: { userId: number } }>();

  app.post("/:oqId", authGuard, async (c) => {
    const oqId = parsePositiveInt(c.req.param("oqId"));

    if (oqId === null) {
      return c.json({ error: "invalid_oq_id" }, 400);
    }

    const body = await c.req.json<ContactRequestBody>();

    try {
      const result = await sendContact(db, {
        fromUserId: c.get("userId"),
        toOqId: oqId,
        message: typeof body.message === "string" ? body.message : "",
      });

      return c.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "oq_not_found" || error.message === "user_not_found") {
          return c.json({ error: error.message }, 404);
        }

        if (forbiddenErrors.has(error.message)) {
          return c.json({ error: error.message }, 403);
        }

        if (badRequestErrors.has(error.message) || contactBadRequestErrors.has(error.message)) {
          return c.json({ error: error.message }, 400);
        }

        if (error.message === "contact_rate_limit") {
          return c.json({ error: error.message }, 429);
        }
      }

      throw error;
    }
  });

  return app;
}
