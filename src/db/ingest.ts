import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { ExploitationOutput, ExploitationFinding } from "../types.ts";
import { jsonStringify } from "../utils.ts";
import { normalizeCategory } from "./categories.ts";
import { withWritableDatabase } from "./sqlite.ts";

const SEVERITIES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const);
type Severity = "critical" | "high" | "medium" | "low" | "info";

function assertTopLevel(data: ExploitationOutput): void {
  if (!data.meta?.target) {
    throw new Error("'meta.target' is required");
  }
  if (!data.meta?.scan_date) {
    throw new Error("'meta.scan_date' is required");
  }
  if (!Array.isArray(data.findings)) {
    throw new Error("'findings' is required");
  }
}

function selectFindings(
  data: ExploitationOutput,
  includeAll: boolean,
): ExploitationFinding[] {
  return data.findings.filter((item) => {
    if (!item.name) {
      throw new Error("Each finding must include a non-empty 'name'");
    }
    if (!item.category) {
      throw new Error(`Finding '${item.name}' is missing 'category'`);
    }
    if (!item.detail) {
      throw new Error(`Finding '${item.name}' is missing 'detail'`);
    }
    return includeAll || item.status === "confirmed";
  });
}

function summaryCounts(
  findings: ExploitationFinding[],
  credentials: NonNullable<ExploitationOutput["loot"]>["credentials"] = [],
): {
  total_vulns: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  confirmed: number;
  creds_found: number;
} {
  const counts = {
    total_vulns: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    confirmed: 0,
    creds_found: credentials.length,
  };

  for (const finding of findings) {
    const severity: Severity = SEVERITIES.has(finding.severity as Severity)
      ? (finding.severity as Severity)
      : "info";
    counts[severity] += 1;
    if ((finding.status ?? "confirmed") === "confirmed") {
      counts.confirmed += 1;
    }
  }

  return counts;
}

export function ingestExploitationOutput(
  data: ExploitationOutput,
  dbPath: string,
  options: { force?: boolean; includeAll?: boolean } = {},
): number {
  assertTopLevel(data);
  mkdirSync(dirname(dbPath), { recursive: true });

  const includeAll = options.includeAll ?? false;
  const findings = selectFindings(data, includeAll);
  const loot = data.loot ?? {};
  const credentials = loot.credentials ?? [];
  const counts = summaryCounts(findings, credentials);

  return withWritableDatabase(dbPath, (db) => {
    const target = data.meta.target;
    const scanDate = data.meta.scan_date;
    const existing = db
      .query("SELECT id FROM engagements WHERE target = ? AND scan_date = ?")
      .get(target, scanDate) as { id?: number } | null;

    if (existing?.id && !options.force) {
      throw new Error(`Engagement already exists for ${target} at ${scanDate}`);
    }

    db.exec("BEGIN");

    try {
      if (existing?.id && options.force) {
        db.query("DELETE FROM findings WHERE engagement_id = ?").run(
          existing.id,
        );
        db.query("DELETE FROM credentials WHERE engagement_id = ?").run(
          existing.id,
        );
        db.query("DELETE FROM data_exfiltrated WHERE engagement_id = ?").run(
          existing.id,
        );
        const chainIds = db
          .query("SELECT id FROM exploitation_chains WHERE engagement_id = ?")
          .all(existing.id) as Array<{ id: number }>;
        for (const chain of chainIds) {
          db.query("DELETE FROM chain_steps WHERE chain_id = ?").run(chain.id);
        }
        db.query("DELETE FROM exploitation_chains WHERE engagement_id = ?").run(
          existing.id,
        );
        db.query("DELETE FROM engagements WHERE id = ?").run(existing.id);
      }

      const scope = data.meta.scope ?? {};
      const rules =
        typeof (scope as { rules_of_engagement?: unknown })
          .rules_of_engagement === "string"
          ? ((scope as { rules_of_engagement?: string }).rules_of_engagement ??
            null)
          : null;
      db.query(
        `
          INSERT INTO engagements
            (target, scan_date, scope_in, scope_out, rules, tools_used, recon_input,
             duration_sec, total_vulns, critical, high, medium, low, info,
             confirmed, creds_found)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
      ).run(
        target,
        scanDate,
        jsonStringify("in_scope" in scope ? scope.in_scope : null),
        jsonStringify("out_of_scope" in scope ? scope.out_of_scope : null),
        rules,
        jsonStringify(data.meta.tools_used ?? null),
        data.meta.recon_input ?? null,
        data.meta.exploitation_duration_seconds ?? null,
        counts.total_vulns,
        counts.critical,
        counts.high,
        counts.medium,
        counts.low,
        counts.info,
        counts.confirmed,
        counts.creds_found,
      );

      const engagementRow = db
        .query("SELECT last_insert_rowid() AS id")
        .get() as { id: number };
      const engagementId = Number(engagementRow.id);

      for (const item of findings) {
        db.query(
          `
            INSERT INTO findings
              (engagement_id, name, category, severity, status, url, parameter,
               http_method, technique, detail, evidence, impact, remediation,
               affected_asset, raw)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `,
        ).run(
          engagementId,
          item.name,
          normalizeCategory(item.category),
          SEVERITIES.has(item.severity as Severity) ? item.severity : "info",
          item.status ?? "confirmed",
          item.url ?? null,
          item.parameter ?? null,
          item.method ?? null,
          item.technique ?? null,
          item.detail,
          item.evidence ?? null,
          item.impact ?? null,
          item.remediation ?? null,
          item.affected_asset ?? null,
          JSON.stringify(item),
        );
      }

      for (const credential of loot.credentials ?? []) {
        db.query(
          `
            INSERT INTO credentials
              (engagement_id, source, username, password_hash, password_cracked, service)
            VALUES (?,?,?,?,?,?)
          `,
        ).run(
          engagementId,
          credential.source ?? null,
          credential.username ?? null,
          credential.password_hash ?? null,
          credential.password_cracked ?? null,
          credential.service ?? null,
        );
      }

      for (const item of loot.data_exfiltrated ?? []) {
        db.query(
          `
            INSERT INTO data_exfiltrated
              (engagement_id, source, record_count, data_types, detail)
            VALUES (?,?,?,?,?)
          `,
        ).run(
          engagementId,
          item.source ?? null,
          item.record_count ?? null,
          jsonStringify(item.data_types ?? null),
          item.detail ?? null,
        );
      }

      for (const chain of data.exploitation_chains ?? []) {
        db.query(
          `
            INSERT INTO exploitation_chains
              (engagement_id, name, final_impact, severity)
            VALUES (?,?,?,?)
          `,
        ).run(
          engagementId,
          chain.name,
          chain.final_impact ?? null,
          chain.severity ?? null,
        );

        const chainRow = db.query("SELECT last_insert_rowid() AS id").get() as {
          id: number;
        };
        const chainId = Number(chainRow.id);

        for (const [index, step] of (chain.steps ?? []).entries()) {
          db.query(
            `
              INSERT INTO chain_steps
                (chain_id, step_order, action, vuln_used, result)
              VALUES (?,?,?,?,?)
            `,
          ).run(
            chainId,
            step.order ?? index + 1,
            step.action ?? null,
            step.vulnerability_used ?? step.vuln_used ?? null,
            step.result ?? null,
          );
        }
      }

      db.exec("COMMIT");
      return engagementId;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
