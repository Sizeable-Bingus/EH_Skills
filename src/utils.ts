import { basename } from "node:path";

export const SEVERITY_ORDER_SQL = [
  "CASE severity",
  "WHEN 'critical' THEN 0",
  "WHEN 'high' THEN 1",
  "WHEN 'medium' THEN 2",
  "WHEN 'low' THEN 3",
  "WHEN 'info' THEN 4",
  "ELSE 5 END",
].join(" ");

export function sanitizeTarget(target: string): string {
  let name = target.toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  name = name.replace(/\/+$/, "");
  for (const character of [".", ":", "/"]) {
    name = name.split(character).join("-");
  }
  return name;
}

export function safeEngagementName(name: string): string {
  return basename(name);
}

export function parseJson<T>(value: unknown): T {
  if (
    value === null ||
    value === undefined ||
    Array.isArray(value) ||
    typeof value === "object"
  ) {
    return value as T;
  }
  if (typeof value !== "string") {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

export function jsonStringify(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function phaseHeader(name: string): string[] {
  return ["", `${"=".repeat(60)}`, `  PHASE: ${name}`, `${"=".repeat(60)}`, ""];
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

