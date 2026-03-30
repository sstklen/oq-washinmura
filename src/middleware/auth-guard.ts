import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "../modules/auth";

type AuthGuardEnv = {
  Variables: {
    userId: number;
  };
};

function unauthorizedResponse() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export const authGuard: MiddlewareHandler<AuthGuardEnv> = async (c, next) => {
  const authorization = c.req.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return unauthorizedResponse();
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.user_id !== "number") {
      return unauthorizedResponse();
    }

    c.set("userId", payload.user_id);
    await next();
  } catch {
    return unauthorizedResponse();
  }
};
