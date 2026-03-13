import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = resolve(SRC_DIR, "..");
export const DIST_PUBLIC_DIR = resolve(PROJECT_ROOT, "dist", "public");
export const ENGAGEMENTS_DIR = resolve(PROJECT_ROOT, "engagements");
export const DEFAULT_DB = process.env.PENTEST_DASHBOARD_DB
  ? resolve(process.env.PENTEST_DASHBOARD_DB)
  : resolve(ENGAGEMENTS_DIR, "10-3-10-10-1234", "pentest_data.db");

const rawFallback = Number.parseInt(
  process.env.PENTEST_DASHBOARD_ENGAGEMENT_ID ?? "1",
  10,
);
export const DEFAULT_ENGAGEMENT_ID = Number.isFinite(rawFallback)
  ? rawFallback
  : 1;

export const BURP_JAR =
  process.env.BURP_JAR ??
  "/Applications/Burp Suite Professional.app/Contents/Resources/app/burpsuite_pro.jar";
export const BURP_JAVA =
  process.env.BURP_JAVA ??
  "/Applications/Burp Suite Professional.app/Contents/Resources/jre.bundle/Contents/Home/bin/java";
export const BURP_REST_API =
  process.env.BURP_REST_API ?? "http://127.0.0.1:1337";
export const BURP_MCP_SSE =
  process.env.BURP_MCP_SSE ?? "http://127.0.0.1:9876/sse";
export const BURP_SCAN_CONFIG = resolve(
  PROJECT_ROOT,
  "burp_headless_scanner",
  "deep.json",
);
export const BURP_STARTUP_TIMEOUT_MS = 120_000;
export const BURP_POLL_INTERVAL_MS = 5_000;

export const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID ?? "";
export const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID ?? "";
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";

export const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;
