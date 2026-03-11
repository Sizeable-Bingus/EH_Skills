import { withWritableDatabase } from "./sqlite.ts";

/**
 * Maps legacy fine-grained categories to the 7 consolidated categories.
 * Unknown categories pass through unchanged (no data loss).
 */
export const CATEGORY_MAP: Record<string, string> = {
  sqli: "injection",
  xss: "injection",
  cmd_injection: "injection",
  ssti: "injection",
  xxe: "injection",
  deserialization: "injection",
  default_creds: "authentication",
  auth_bypass: "authentication",
  session_issue: "authentication",
  jwt_issue: "authentication",
  authenticated_access: "authentication",
  idor: "authorization",
  priv_esc: "authorization",
  missing_auth: "authorization",
  ssrf: "ssrf",
  cors: "configuration",
  rate_limit_missing: "configuration",
  information_disclosure: "configuration",
  outdated_software: "configuration",
  path_traversal: "file_access",
  file_upload: "file_access",
  business_logic: "business_logic",
  websocket: "business_logic"
};

export const VALID_CATEGORIES = [
  "injection",
  "authentication",
  "authorization",
  "ssrf",
  "configuration",
  "file_access",
  "business_logic"
] as const;

export type ValidCategory = (typeof VALID_CATEGORIES)[number];

export function normalizeCategory(raw: string): string {
  return CATEGORY_MAP[raw] ?? raw;
}

export function migrateCategories(dbPath: string): number {
  return withWritableDatabase(dbPath, (db) => {
    let updated = 0;
    for (const [oldCat, newCat] of Object.entries(CATEGORY_MAP)) {
      const result = db
        .query("UPDATE findings SET category = ? WHERE category = ?")
        .run(newCat, oldCat);
      updated += result.changes;
    }
    return updated;
  });
}
