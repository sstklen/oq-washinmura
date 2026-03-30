import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { corsMiddleware } from "./cors";

function createApp() {
  const app = new Hono();

  app.use("*", corsMiddleware);
  app.get("/resource", (c) => c.json({ ok: true }));

  return app;
}

describe("corsMiddleware", () => {
  test("allows the production origin preflight request", async () => {
    const app = createApp();

    const response = await app.request("/resource", {
      method: "OPTIONS",
      headers: {
        Origin: "https://oq.washinmura.jp",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://oq.washinmura.jp",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET,POST,PUT,OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type,Authorization",
    );
  });

  test("does not allow an unknown origin", async () => {
    const app = createApp();

    const response = await app.request("/resource", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.com",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
