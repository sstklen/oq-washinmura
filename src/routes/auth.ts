import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { sendCode, verifyCode } from "../modules/auth";
import { isValidEmail } from "../modules/email";

type AuthRequestBody = {
  email?: string;
  code?: string;
};

export function createAuthRoutes(db: Database): Hono {
  const app = new Hono();

  app.post("/send-code", async (c) => {
    const body = await c.req.json<AuthRequestBody>();

    if (typeof body.email !== "string" || !isValidEmail(body.email)) {
      return c.json({ error: "invalid_email" }, 400);
    }

    try {
      await sendCode(db, body.email);
      return c.json({ ok: true });
    } catch (error) {
      console.error("[auth/send-code]", error);
      return c.json({ error: "email_send_failed" }, 500);
    }
  });

  app.post("/verify", async (c) => {
    const body = await c.req.json<AuthRequestBody>();

    if (typeof body.email !== "string" || !isValidEmail(body.email)) {
      return c.json({ error: "invalid_email" }, 400);
    }

    if (typeof body.code !== "string") {
      return c.json({ error: "missing_fields" }, 400);
    }

    const trimmedCode = body.code.trim();

    try {
      const result = await verifyCode(db, body.email, trimmedCode);
      return c.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "invalid_code" || error.message === "code_expired") {
          return c.json({ error: error.message }, 401);
        }
      }

      throw error;
    }
  });

  return app;
}
