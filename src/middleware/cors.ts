import { cors } from "hono/cors";

const allowedOrigin = "https://oq.washinmura.jp";
const localhostOriginPattern = /^http:\/\/localhost(?::\d+)?$/;

function isProduction(): boolean {
  const runtime = globalThis as {
    process?: {
      env?: {
        NODE_ENV?: string;
      };
    };
  };

  return runtime.process?.env?.NODE_ENV === "production";
}

function resolveOrigin(origin: string): string | null {
  if (origin === allowedOrigin) {
    return origin;
  }

  if (!isProduction() && localhostOriginPattern.test(origin)) {
    return origin;
  }

  return null;
}

export const corsMiddleware = cors({
  origin: resolveOrigin,
  allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
});
