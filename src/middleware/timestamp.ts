import type { MiddlewareHandler } from "hono";

/**
 * 自動在所有 JSON 回傳注入 timestamp 欄位。
 * 向後相容：只加欄位，不刪不改既有欄位。
 */
export const timestampMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  const contentType = c.res.headers.get("content-type");
  if (!contentType?.includes("application/json")) return;

  try {
    const body = await c.res.json();
    const enhanced = { ...body, timestamp: new Date().toISOString() };
    c.res = new Response(JSON.stringify(enhanced), {
      status: c.res.status,
      headers: c.res.headers,
    });
  } catch {
    // non-JSON body, skip
  }
};
