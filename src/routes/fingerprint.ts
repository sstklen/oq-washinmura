import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { parsePositiveInt } from "../constants";
import {
  ensureFingerprintTable,
  getFingerprint,
  matchFingerprints,
  submitFingerprint,
  type OqScores,
} from "../modules/fingerprint";

type SubmitFingerprintBody = {
  anonymous_id?: string;
  scores?: OqScores;
  oq_type?: string;
};

const badRequestErrors = new Set([
  "missing_fields",
  "anonymous_id_too_long",
  "invalid_scores",
  "invalid_oq_type",
]);

export function createFingerprintRoutes(db: Database): Hono {
  const app = new Hono();
  ensureFingerprintTable(db);

  app.post("/submit", async (c) => {
    const body = await c.req.json<SubmitFingerprintBody>();

    try {
      const result = submitFingerprint(db, body);
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof Error && badRequestErrors.has(error.message)) {
        return c.json({ error: error.message }, 400);
      }

      throw error;
    }
  });

  app.get("/match/:id", (c) => {
    const id = parsePositiveInt(c.req.param("id"));

    if (id === null) {
      return c.json({ error: "invalid_fingerprint_id" }, 400);
    }

    try {
      return c.json({ matches: matchFingerprints(db, id) });
    } catch (error) {
      if (error instanceof Error && error.message === "fingerprint_not_found") {
        return c.json({ error: error.message }, 404);
      }

      throw error;
    }
  });

  app.get("/:id", (c) => {
    const id = parsePositiveInt(c.req.param("id"));

    if (id === null) {
      return c.json({ error: "invalid_fingerprint_id" }, 400);
    }

    const fingerprint = getFingerprint(db, id);

    if (!fingerprint) {
      return c.json({ error: "fingerprint_not_found" }, 404);
    }

    return c.json({ fingerprint });
  });

  return app;
}
