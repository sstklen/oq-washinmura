import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { createAuthToken, getJwtSecretKey } from "../modules/auth";
import { authGuard } from "./auth-guard";

process.env.JWT_SECRET = "test-secret";

async function createExpiredToken(): Promise<string> {
  return await new SignJWT({
    user_id: 99,
    email: "expired@example.com",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(getJwtSecretKey());
}

async function createFakeSignedToken(): Promise<string> {
  return await new SignJWT({
    user_id: 88,
    email: "fake@example.com",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode("fake-secret"));
}

function createApp() {
  const app = new Hono<{ Variables: { userId: number } }>();

  app.use("*", authGuard);
  app.get("/private", (c) => c.json({ userId: c.get("userId") }));

  return app;
}

describe("authGuard", () => {
  test("accepts a valid JWT and exposes userId on the context", async () => {
    const app = createApp();
    const token = await createAuthToken({
      user_id: 42,
      email: "valid@example.com",
    });

    const response = await app.request("/private", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: 42 });
  });

  test("returns 401 when the authorization header is missing", async () => {
    const app = createApp();

    const response = await app.request("/private");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("returns 401 when the JWT is expired", async () => {
    const app = createApp();
    const token = await createExpiredToken();

    const response = await app.request("/private", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("returns 401 when the JWT signature is invalid", async () => {
    const app = createApp();
    const token = await createFakeSignedToken();

    const response = await app.request("/private", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
