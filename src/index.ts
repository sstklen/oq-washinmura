import { Hono } from "hono";
import { getDb } from "./db";
import { corsMiddleware } from "./middleware/cors";
import { authSendCodeLimiter, authVerifyLimiter, leaderboardLimiter } from "./middleware/rate-limit";
import { createAuthRoutes } from "./routes/auth";
import { createContactRoutes } from "./routes/contact";
import { createFingerprintRoutes } from "./routes/fingerprint";
import { createLeaderboardRoutes } from "./routes/leaderboard";
import { createOqRoutes } from "./routes/oq";

const app = new Hono();

// 全域 error handler — 壞 JSON、未捕獲 throw 都回 JSON 不回 500 裸文字
app.onError((err, c) => {
  if (err instanceof SyntaxError && err.message.includes("JSON")) {
    return c.json({ error: "invalid_json" }, 400);
  }
  console.error("[unhandled]", err);
  return c.json({ error: "internal_server_error" }, 500);
});

// 初始化 DB 並 export 供路由模組使用
export const db = getDb();

app.use("*", corsMiddleware);

// request logging（health 除外，避免噪音）
app.use("*", async (c, next) => {
  if (c.req.path === "/health") {
    await next();
    return;
  }
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
});

app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

// 限速掛到各路由前
app.use("/api/auth/send-code", authSendCodeLimiter);
app.use("/api/auth/verify", authVerifyLimiter);
app.use("/api/leaderboard", leaderboardLimiter);

app.route("/api/auth", createAuthRoutes(db));
app.route("/api/contact", createContactRoutes(db));
app.route("/api/oq", createOqRoutes(db));
app.route("/api/oq/fingerprint", createFingerprintRoutes(db));
app.route("/api/leaderboard", createLeaderboardRoutes(db));

const port = Number.parseInt(process.env.PORT ?? "3100", 10);

export default {
  port,
  fetch: app.fetch,
};
