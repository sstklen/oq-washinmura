import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { timestampMiddleware } from "./timestamp";

function createTestApp() {
  const app = new Hono();
  app.use("*", timestampMiddleware);

  app.get("/ok", (c) => c.json({ status: "ok" }));
  app.get("/error", (c) => c.json({ error: "not_found" }, 404));
  app.get("/created", (c) => c.json({ id: 1 }, 201));
  app.get("/text", (c) => c.text("hello"));

  return app;
}

describe("timestamp middleware", () => {
  const app = createTestApp();

  test("adds timestamp to successful JSON response", async () => {
    const res = await app.request("/ok");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  test("adds timestamp to error JSON response (preserves status code)", async () => {
    const res = await app.request("/error");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.timestamp).toBeDefined();
  });

  test("adds timestamp to 201 response", async () => {
    const res = await app.request("/created");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.timestamp).toBeDefined();
  });

  test("does not modify non-JSON responses", async () => {
    const res = await app.request("/text");
    const text = await res.text();
    expect(text).toBe("hello");
  });

  test("timestamp is valid ISO 8601", async () => {
    const res = await app.request("/ok");
    const body = await res.json();
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("preserves all original fields (backward compatible)", async () => {
    const res = await app.request("/ok");
    const body = await res.json();
    expect(Object.keys(body)).toContain("status");
    expect(Object.keys(body)).toContain("timestamp");
  });
});

describe("contradiction resolution: standard HTTP status codes (not 200+error)", () => {
  const app = createTestApp();

  test("error responses use proper HTTP status codes, not 200", async () => {
    const res = await app.request("/error");
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(200);
  });
});

describe("contradiction resolution: rate limiting uses middleware (not inline)", () => {
  test("rate-limit middleware exists and exports limiters", async () => {
    const mod = await import("./rate-limit");
    expect(mod.defaultLimiter).toBeDefined();
    expect(mod.authSendCodeLimiter).toBeDefined();
    expect(mod.authVerifyLimiter).toBeDefined();
    expect(mod.leaderboardLimiter).toBeDefined();
  });
});
