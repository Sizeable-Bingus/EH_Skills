import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";

export interface AuthConfig {
  clientId: string;
  tenantId: string;
  disabled?: boolean;
}

export function createAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  if (config.disabled) {
    return async (_c, next) => {
      await next();
    };
  }

  const jwks = createRemoteJWKSet(
    new URL(
      `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
    ),
  );

  return async (c, next) => {
    if (c.req.path.startsWith("/static/")) {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        { detail: "Missing or malformed Authorization header" },
        401,
      );
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, jwks, {
        audience: config.clientId,
        issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
      });

      if (payload.tid !== config.tenantId) {
        return c.json({ detail: "Token tenant mismatch" }, 403);
      }

      c.set("authPayload", payload);
      await next();
    } catch {
      return c.json({ detail: "Invalid or expired token" }, 401);
    }
  };
}
