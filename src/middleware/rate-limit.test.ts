import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createRateLimiter } from "./rate-limit";

const originalDateNow = Date.now;

afterEach(() => {
  Date.now = originalDateNow;
});

function createApp(limiter = createRateLimiter({
  windowMs: 10_000,
  max: 3,
  keyFn: () => "shared-key",
})) {
  const app = new Hono();

  app.use("*", limiter);
  app.get("/limited", (c) => c.json({ ok: true }));

  return app;
}

describe("createRateLimiter", () => {
  test("allows requests until max and blocks the next one", async () => {
    Date.now = () => 1_000;

    const app = createApp();

    const firstResponse = await app.request("/limited");
    const secondResponse = await app.request("/limited");
    const thirdResponse = await app.request("/limited");
    const fourthResponse = await app.request("/limited");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(thirdResponse.status).toBe(200);
    expect(fourthResponse.status).toBe(429);
    expect(await fourthResponse.json()).toEqual({
      error: "rate_limit",
      retry_after: 10,
    });
  });

  test("resets after the window expires", async () => {
    let now = 5_000;
    Date.now = () => now;

    const app = createApp(createRateLimiter({
      windowMs: 1_000,
      max: 3,
      keyFn: () => "shared-key",
    }));

    const firstResponse = await app.request("/limited");
    const secondResponse = await app.request("/limited");
    const thirdResponse = await app.request("/limited");
    const limitedResponse = await app.request("/limited");

    now += 1_001;

    const resetResponse = await app.request("/limited");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(thirdResponse.status).toBe(200);
    expect(limitedResponse.status).toBe(429);
    expect(resetResponse.status).toBe(200);
  });
});
