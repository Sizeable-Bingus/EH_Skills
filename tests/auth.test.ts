import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

import { createAuthMiddleware } from "../src/auth.ts";

const TEST_CLIENT_ID = "test-client-id";
const TEST_TENANT_ID = "test-tenant-id";

describe("auth middleware", () => {
  test("disabled config passes all requests through", async () => {
    const mw = createAuthMiddleware({
      clientId: TEST_CLIENT_ID,
      tenantId: TEST_TENANT_ID,
      disabled: true,
    });
    const app = new Hono();
    app.use(mw);
    app.get("/api/test", (c) => c.json({ ok: true }));

    const response = await app.request("/api/test");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("returns 401 when Authorization header is missing", async () => {
    const mw = createAuthMiddleware({
      clientId: TEST_CLIENT_ID,
      tenantId: TEST_TENANT_ID,
    });
    const app = new Hono();
    app.use(mw);
    app.get("/api/test", (c) => c.json({ ok: true }));

    const response = await app.request("/api/test");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      detail: "Missing or malformed Authorization header",
    });
  });

  test("returns 401 for non-Bearer auth scheme", async () => {
    const mw = createAuthMiddleware({
      clientId: TEST_CLIENT_ID,
      tenantId: TEST_TENANT_ID,
    });
    const app = new Hono();
    app.use(mw);
    app.get("/api/test", (c) => c.json({ ok: true }));

    const response = await app.request("/api/test", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      detail: "Missing or malformed Authorization header",
    });
  });

  test("returns 401 for invalid/expired JWT", async () => {
    const mw = createAuthMiddleware({
      clientId: TEST_CLIENT_ID,
      tenantId: TEST_TENANT_ID,
    });
    const app = new Hono();
    app.use(mw);
    app.get("/api/test", (c) => c.json({ ok: true }));

    const response = await app.request("/api/test", {
      headers: { Authorization: "Bearer invalid.jwt.token" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      detail: "Invalid or expired token",
    });
  });

  test("skips auth for /static/ paths", async () => {
    const mw = createAuthMiddleware({
      clientId: TEST_CLIENT_ID,
      tenantId: TEST_TENANT_ID,
    });
    const app = new Hono();
    app.use(mw);
    app.get("/static/test.css", (c) => c.text("body{}"));

    const response = await app.request("/static/test.css");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body{}");
  });

  test("returns 403 when token tenant does not match config", async () => {
    const jose = await import("jose");
    const originalJwtVerify = jose.jwtVerify;

    void mock.module("jose", () => ({
      ...jose,
      jwtVerify: async () => ({
        payload: {
          aud: TEST_CLIENT_ID,
          iss: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
          tid: "wrong-tenant-id",
        },
        protectedHeader: { alg: "RS256" },
      }),
    }));

    try {
      const { createAuthMiddleware: freshCreate } =
        await import("../src/auth.ts");
      const mw = freshCreate({
        clientId: TEST_CLIENT_ID,
        tenantId: TEST_TENANT_ID,
      });
      const app = new Hono();
      app.use(mw);
      app.get("/api/test", (c) => c.json({ ok: true }));

      const response = await app.request("/api/test", {
        headers: { Authorization: "Bearer valid.mock.token" },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        detail: "Token tenant mismatch",
      });
    } finally {
      void mock.module("jose", () => ({
        ...jose,
        jwtVerify: originalJwtVerify,
      }));
    }
  });

  test("allows request with valid token and matching tenant", async () => {
    const jose = await import("jose");
    const originalJwtVerify = jose.jwtVerify;

    void mock.module("jose", () => ({
      ...jose,
      jwtVerify: async () => ({
        payload: {
          aud: TEST_CLIENT_ID,
          iss: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
          tid: TEST_TENANT_ID,
          sub: "user-123",
        },
        protectedHeader: { alg: "RS256" },
      }),
    }));

    try {
      const { createAuthMiddleware: freshCreate } =
        await import("../src/auth.ts");
      const mw = freshCreate({
        clientId: TEST_CLIENT_ID,
        tenantId: TEST_TENANT_ID,
      });
      const app = new Hono();
      app.use(mw);
      app.get("/api/test", (c) => c.json({ ok: true }));

      const response = await app.request("/api/test", {
        headers: { Authorization: "Bearer valid.mock.token" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      void mock.module("jose", () => ({
        ...jose,
        jwtVerify: originalJwtVerify,
      }));
    }
  });
});
