import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { ApiBindings, ApiVariables } from "../app.types";
import { parseAllowedOrigins } from "../config/env";

export function corsMiddleware(): MiddlewareHandler<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}> {
  return async (c, next) => {
    const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
    const middleware = cors({
      origin: (origin) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return origin;
        }

        return allowedOrigins[0] ?? "http://localhost:5173";
      },
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true
    });

    return middleware(c, next);
  };
}
