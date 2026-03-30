import { Hono } from "hono";
import { getDb } from "./db";
import { corsMiddleware } from "./middleware/cors";
import { createAuthRoutes } from "./routes/auth";
import { createContactRoutes } from "./routes/contact";
import { createOqRoutes } from "./routes/oq";
import { createLeaderboardRoutes } from "./routes/leaderboard";

const app = new Hono();

// 初始化 DB 並 export 供路由模組使用
export const db = getDb();

app.use("*", corsMiddleware);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

app.route("/api/auth", createAuthRoutes(db));
app.route("/api/contact", createContactRoutes(db));
app.route("/api/oq", createOqRoutes(db));
app.route("/api/leaderboard", createLeaderboardRoutes(db));

const port = Number.parseInt(process.env.PORT ?? "3100", 10);

export default {
  port,
  fetch: app.fetch,
};
