import type { Context, MiddlewareHandler } from "hono";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn: (c: Context) => string;
};

type RateLimiterState = {
  entries: Map<string, RateLimitEntry>;
  windowMs: number;
  max: number;
};

function createRateLimiterState(
  options: Pick<RateLimitOptions, "windowMs" | "max">,
): RateLimiterState {
  const entries = new Map<string, RateLimitEntry>();
  const interval = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }, 60_000) as unknown as { unref?: () => void };

  interval.unref?.();

  return {
    entries,
    windowMs: options.windowMs,
    max: options.max,
  };
}

function normalizeKey(key: string): string {
  const normalizedKey = key.trim();

  return normalizedKey.length > 0 ? normalizedKey : "anonymous";
}

async function applyRateLimit(
  c: Context,
  next: () => Promise<void>,
  state: RateLimiterState,
  key: string,
): Promise<Response | void> {
  const now = Date.now();
  const normalizedKey = normalizeKey(key);
  const current = state.entries.get(normalizedKey);

  if (!current || current.resetAt <= now) {
    state.entries.set(normalizedKey, {
      count: 1,
      resetAt: now + state.windowMs,
    });
    await next();
    return;
  }

  if (current.count >= state.max) {
    return c.json(
      {
        error: "rate_limit",
        retry_after: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      },
      429,
    );
  }

  current.count += 1;
  await next();
}

async function getJsonField(c: Context, fieldName: string): Promise<string> {
  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return "anonymous";
  }

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const value = body[fieldName];

    return typeof value === "string" ? value : "anonymous";
  } catch {
    return "anonymous";
  }
}

function getClientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return c.req.header("x-real-ip")?.trim() || "unknown";
}

export function createRateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const state = createRateLimiterState(options);

  return async (c, next) => {
    return await applyRateLimit(c, next, state, options.keyFn(c));
  };
}

function createJsonFieldRateLimiter(
  fieldName: string,
  options: Pick<RateLimitOptions, "windowMs" | "max">,
): MiddlewareHandler {
  const state = createRateLimiterState(options);

  return async (c, next) => {
    const key = await getJsonField(c, fieldName);

    return await applyRateLimit(c, next, state, key);
  };
}

export const authSendCodeLimiter = createJsonFieldRateLimiter("email", {
  windowMs: 60_000,
  max: 1,
});

export const authVerifyLimiter = createJsonFieldRateLimiter("email", {
  windowMs: 10 * 60_000,
  max: 5,
});

export const leaderboardLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyFn: getClientIp,
});

export const defaultLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyFn: (c) => String(c.get("userId") ?? "anonymous"),
});
