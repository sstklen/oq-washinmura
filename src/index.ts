import { Hono } from "hono";
import { getDb } from "./db";
import { corsMiddleware } from "./middleware/cors";
import { timestampMiddleware } from "./middleware/timestamp";
import { authSendCodeLimiter, authVerifyLimiter, leaderboardLimiter, defaultLimiter } from "./middleware/rate-limit";
import { createAuthRoutes } from "./routes/auth";
import { createContactRoutes } from "./routes/contact";
import { createFingerprintRoutes } from "./routes/fingerprint";
import { createLeaderboardRoutes, getApiStats } from "./routes/leaderboard";
import { createOqRoutes } from "./routes/oq";

const app = new Hono();

// 全域 error handler — 壞 JSON、TypeError（body=null）、未捕獲 throw
app.onError((err, c) => {
  if (err instanceof SyntaxError && err.message.includes("JSON")) {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (err instanceof TypeError && (err.message.includes("not an object") || err.message.includes("Cannot read"))) {
    return c.json({ error: "invalid_request_body" }, 400);
  }
  console.error("[unhandled]", err.message);
  return c.json({ error: "internal_server_error" }, 500);
});

// 啟動時檢查必要環境變數
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET not set");
  process.exit(1);
}

// 初始化 DB 並 export 供路由模組使用
export const db = getDb();

app.use("*", corsMiddleware);
app.use("*", timestampMiddleware);

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

// --- 統一 healthz（跨專案共通格式）---
const _oqStartedAt = Date.now();
app.get("/healthz", (c) => {
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(
      require("fs").readFileSync(
        require("path").join(import.meta.dir, "../../package.json"),
        "utf-8",
      ),
    );
    version = pkg.version ?? "0.0.0";
  } catch {
    /* ignore */
  }
  return c.json({
    status: "ok",
    project: "oq-washinmura",
    version,
    uptime_seconds: Math.floor((Date.now() - _oqStartedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// 站台總覽統計 API
app.get("/api/stats", (c) => {
  return c.json(getApiStats(db));
});

// 限速掛到各路由前
app.use("/api/auth/send-code", authSendCodeLimiter);
app.use("/api/auth/verify", authVerifyLimiter);
app.use("/api/leaderboard", leaderboardLimiter);
app.use("/api/oq/*", defaultLimiter);
app.use("/api/contact/*", defaultLimiter);

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
