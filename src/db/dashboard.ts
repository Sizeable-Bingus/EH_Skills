import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_DB,
  DEFAULT_ENGAGEMENT_ID,
  ENGAGEMENTS_DIR
} from "../constants.ts";
import type {
  ChainsPageModel,
  DashboardEngagementRow,
  DashboardPageModel,
  EngagementRecord,
  EngagementSummaryViewModel,
  FindingsPageModel,
  FindingRecord,
  LootPageModel,
  ScopeModel
} from "../types.ts";
import { parseJson, safeEngagementName, SEVERITY_ORDER_SQL } from "../utils.ts";
import { withReadOnlyDatabase } from "./sqlite.ts";

type Row = Record<string, unknown>;

export class UnknownEngagementError extends Error {
  constructor(engagement: string) {
    super(`Unknown engagement: ${engagement}`);
    this.name = "UnknownEngagementError";
  }
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function fetchAll(dbPath: string, sql: string, params: unknown[] = []): Row[] {
  return withReadOnlyDatabase(
    dbPath,
    (db) => db.query(sql).all(...(params as never[])) as Row[]
  );
}

function fetchOne(
  dbPath: string,
  sql: string,
  params: unknown[] = []
): Row | null {
  return withReadOnlyDatabase(
    dbPath,
    (db) => (db.query(sql).get(...(params as never[])) as Row | null) ?? null
  );
}

function getLatestEngagementRecord(
  dbPath: string
): { engagementId: number; scanDate: string } | null {
  const row = fetchOne(
    dbPath,
    "SELECT id, scan_date FROM engagements ORDER BY scan_date DESC, id DESC LIMIT 1"
  );
  if (typeof row?.id !== "number") {
    return null;
  }

  return {
    engagementId: row.id,
    scanDate: stringValue(row.scan_date)
  };
}

function normalizeScope(engagement: Row): ScopeModel | string | null {
  if ("scope" in engagement) {
    const scope = parseJson<ScopeModel | string>(engagement.scope);
    if (typeof scope === "string" && scope.length > 0) {
      return scope;
    }
    if (scope && typeof scope === "object" && !Array.isArray(scope)) {
      return scope;
    }
  }

  const inScope =
    (parseJson<string[]>(engagement.scope_in) as string[] | null) ?? [];
  const outOfScope =
    (parseJson<string[]>(engagement.scope_out) as string[] | null) ?? [];
  const rules = typeof engagement.rules === "string" ? engagement.rules : null;

  if (inScope.length > 0 || outOfScope.length > 0 || rules) {
    return {
      in_scope: inScope,
      out_of_scope: outOfScope,
      rules_of_engagement: rules
    };
  }

  return null;
}

function normalizeEngagement(row: Row | null): EngagementRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id ?? 0),
    target: stringValue(row.target),
    scan_date: stringValue(row.scan_date),
    tools_used:
      (parseJson<string[]>(row.tools_used) as string[] | null) ?? null,
    scope: normalizeScope(row),
    duration_sec: typeof row.duration_sec === "number" ? row.duration_sec : null
  };
}

export function getLatestEngagementId(
  dbPath: string = DEFAULT_DB,
  fallback: number = DEFAULT_ENGAGEMENT_ID
): number {
  if (!existsSync(dbPath)) {
    return fallback;
  }

  const row = fetchOne(
    dbPath,
    "SELECT id FROM engagements ORDER BY scan_date DESC, id DESC LIMIT 1"
  );

  return typeof row?.id === "number" ? row.id : fallback;
}

export function resolveEngagementDb(engagement?: string | null): {
  dbPath: string;
  engagementId: number;
} {
  return resolveEngagementDbInDir(engagement, ENGAGEMENTS_DIR);
}

export function resolveEngagementDbInDir(
  engagement: string | null | undefined,
  engagementsDir: string = ENGAGEMENTS_DIR
): {
  dbPath: string;
  engagementId: number;
} {
  if (engagement) {
    const safeName = safeEngagementName(engagement);
    const dbPath = join(engagementsDir, safeName, "pentest_data.db");
    if (!existsSync(dbPath)) {
      throw new UnknownEngagementError(safeName);
    }
    return { dbPath, engagementId: getLatestEngagementId(dbPath) };
  }

  const latestDatabase = listEngagements(engagementsDir)
    .map((name) => {
      const dbPath = join(engagementsDir, name, "pentest_data.db");
      const latestRecord = getLatestEngagementRecord(dbPath);
      if (!latestRecord) {
        return null;
      }
      return {
        dbPath,
        engagementId: latestRecord.engagementId,
        scanDate: latestRecord.scanDate
      };
    })
    .filter((record) => record !== null)
    .sort((left, right) => {
      if (left.scanDate !== right.scanDate) {
        return right.scanDate.localeCompare(left.scanDate);
      }
      if (left.engagementId !== right.engagementId) {
        return right.engagementId - left.engagementId;
      }
      return left.dbPath.localeCompare(right.dbPath);
    })[0];

  if (latestDatabase) {
    return {
      dbPath: latestDatabase.dbPath,
      engagementId: latestDatabase.engagementId
    };
  }

  return {
    dbPath: DEFAULT_DB,
    engagementId: getLatestEngagementId(DEFAULT_DB)
  };
}

export function getSummaryPage(
  dbPath: string = DEFAULT_DB,
  engagementId: number = DEFAULT_ENGAGEMENT_ID
): EngagementSummaryViewModel {
  const engagement = normalizeEngagement(
    fetchOne(dbPath, "SELECT * FROM engagements WHERE id = ?", [engagementId])
  );

  const severityCounts: EngagementSummaryViewModel["severityCounts"] = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };

  for (const row of fetchAll(
    dbPath,
    "SELECT severity, COUNT(*) AS count FROM findings WHERE engagement_id = ? GROUP BY severity",
    [engagementId]
  )) {
    const severity = stringValue(row.severity);
    if (severity in severityCounts) {
      severityCounts[severity as keyof typeof severityCounts] = Number(
        row.count ?? 0
      );
    }
  }

  const categoryCounts = fetchAll(
    dbPath,
    "SELECT category, COUNT(*) AS count FROM findings WHERE engagement_id = ? GROUP BY category ORDER BY count DESC, category",
    [engagementId]
  ).map((row) => ({
    category: stringValue(row.category),
    count: Number(row.count ?? 0)
  }));

  const statsRow =
    fetchOne(
      dbPath,
      `
      SELECT
        (SELECT COUNT(*) FROM findings WHERE engagement_id = ?) AS total_findings,
        (SELECT COUNT(*) FROM credentials WHERE engagement_id = ?) AS total_credentials,
        (SELECT COUNT(*) FROM exploitation_chains WHERE engagement_id = ?) AS total_chains
      `,
      [engagementId, engagementId, engagementId]
    ) ?? {};

  return {
    engagement,
    severityCounts,
    categoryCounts,
    stats: {
      total_findings: Number(statsRow.total_findings ?? 0),
      total_credentials: Number(statsRow.total_credentials ?? 0),
      total_chains: Number(statsRow.total_chains ?? 0)
    }
  };
}

export function getFindingsPage(
  dbPath: string = DEFAULT_DB,
  engagementId: number = DEFAULT_ENGAGEMENT_ID,
  options: { severity?: string | null; category?: string | null } = {}
): FindingsPageModel {
  const sqlParts = ["SELECT * FROM findings WHERE engagement_id = ?"];
  const params: unknown[] = [engagementId];

  if (options.severity) {
    sqlParts.push("AND severity = ?");
    params.push(options.severity);
  }
  if (options.category) {
    sqlParts.push("AND category = ?");
    params.push(options.category);
  }

  sqlParts.push(`ORDER BY ${SEVERITY_ORDER_SQL}, category, id`);

  const findings = fetchAll(dbPath, sqlParts.join(" "), params).map((row) =>
    normalizeFinding(row)
  );

  const severities = fetchAll(
    dbPath,
    `SELECT DISTINCT severity FROM findings WHERE engagement_id = ? ORDER BY ${SEVERITY_ORDER_SQL}`,
    [engagementId]
  )
    .map((row) => row.severity)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );

  const categories = fetchAll(
    dbPath,
    "SELECT DISTINCT category FROM findings WHERE engagement_id = ? ORDER BY category",
    [engagementId]
  )
    .map((row) => row.category)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );

  return {
    findings,
    severities,
    categories,
    curSeverity: options.severity ?? "",
    curCategory: options.category ?? ""
  };
}

function normalizeFinding(row: Row): FindingRecord {
  return {
    id: Number(row.id ?? 0),
    name: typeof row.name === "string" ? row.name : null,
    category: stringValue(row.category),
    severity: stringValue(row.severity, "info"),
    status: stringValue(row.status, "confirmed"),
    url: typeof row.url === "string" ? row.url : null,
    parameter: typeof row.parameter === "string" ? row.parameter : null,
    method:
      typeof row.http_method === "string"
        ? row.http_method
        : typeof row.method === "string"
          ? row.method
          : null,
    technique: typeof row.technique === "string" ? row.technique : null,
    detail: typeof row.detail === "string" ? row.detail : null,
    evidence: typeof row.evidence === "string" ? row.evidence : null,
    impact: typeof row.impact === "string" ? row.impact : null,
    remediation: typeof row.remediation === "string" ? row.remediation : null,
    affected_asset:
      typeof row.affected_asset === "string" ? row.affected_asset : null,
    raw: parseJson(row.raw)
  };
}

export function getChainsPage(
  dbPath: string = DEFAULT_DB,
  engagementId: number = DEFAULT_ENGAGEMENT_ID
): ChainsPageModel {
  const chains = fetchAll(
    dbPath,
    "SELECT * FROM exploitation_chains WHERE engagement_id = ? ORDER BY id",
    [engagementId]
  );
  const steps = fetchAll(
    dbPath,
    "SELECT * FROM chain_steps WHERE chain_id IN (SELECT id FROM exploitation_chains WHERE engagement_id = ?) ORDER BY chain_id, step_order, id",
    [engagementId]
  );

  const stepsByChain = new Map<
    number,
    ChainsPageModel["chains"][number]["steps"]
  >();
  for (const step of steps) {
    const chainId = Number(step.chain_id ?? 0);
    const current = stepsByChain.get(chainId) ?? [];
    current.push({
      id: Number(step.id ?? 0),
      step_order: Number(step.step_order ?? 0),
      action: typeof step.action === "string" ? step.action : null,
      vuln_used: typeof step.vuln_used === "string" ? step.vuln_used : null,
      result: typeof step.result === "string" ? step.result : null
    });
    stepsByChain.set(chainId, current);
  }

  return {
    chains: chains.map((row) => ({
      id: Number(row.id ?? 0),
      name: stringValue(row.name),
      final_impact:
        typeof row.final_impact === "string" ? row.final_impact : null,
      severity: typeof row.severity === "string" ? row.severity : null,
      steps: stepsByChain.get(Number(row.id ?? 0)) ?? []
    }))
  };
}

export function getLootPage(
  dbPath: string = DEFAULT_DB,
  engagementId: number = DEFAULT_ENGAGEMENT_ID
): LootPageModel {
  const credentials = fetchAll(
    dbPath,
    "SELECT * FROM credentials WHERE engagement_id = ? ORDER BY id",
    [engagementId]
  );

  return {
    credentials: credentials.map((credential) => {
      const detailParts = [
        stringValue(credential.username, "Unknown username")
      ];
      if (
        typeof credential.service === "string" &&
        credential.service.length > 0
      ) {
        detailParts.push(credential.service);
      }

      const evidenceParts: string[] = [];
      if (
        typeof credential.password_hash === "string" &&
        credential.password_hash.length > 0
      ) {
        evidenceParts.push(`Hash: ${credential.password_hash}`);
      }
      if (
        typeof credential.password_cracked === "string" &&
        credential.password_cracked.length > 0
      ) {
        evidenceParts.push(`Cracked: ${credential.password_cracked}`);
      }

      return {
        technique:
          typeof credential.source === "string" && credential.source.length > 0
            ? credential.source
            : "Unknown source",
        detail: detailParts.join(" | "),
        evidence: evidenceParts.join(" | ") || "Captured credential material"
      };
    })
  };
}

export function listEngagements(
  engagementsDir: string = ENGAGEMENTS_DIR
): string[] {
  if (!existsSync(engagementsDir)) {
    return [];
  }

  return readdirSync(engagementsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase() !== "default")
    .filter((name) => existsSync(join(engagementsDir, name, "pentest_data.db")))
    .sort((left, right) => left.localeCompare(right));
}

export function getDashboardPage(
  engagementsDir: string = ENGAGEMENTS_DIR
): DashboardPageModel {
  const names = listEngagements(engagementsDir);

  const severityCounts: DashboardPageModel["severityCounts"] = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };
  const categoryMap = new Map<string, number>();
  const engagements: DashboardEngagementRow[] = [];

  let totalFindings = 0;
  let totalCredentials = 0;
  let totalChains = 0;

  for (const name of names) {
    const dbPath = join(engagementsDir, name, "pentest_data.db");
    if (!existsSync(dbPath)) {
      continue;
    }

    const engRow = fetchOne(
      dbPath,
      "SELECT target, scan_date FROM engagements ORDER BY scan_date DESC, id DESC LIMIT 1"
    );

    const sevRows = fetchAll(
      dbPath,
      "SELECT severity, COUNT(*) AS count FROM findings GROUP BY severity"
    );
    const rowSeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };
    let engFindingTotal = 0;
    for (const row of sevRows) {
      const sev = stringValue(row.severity);
      const count = Number(row.count ?? 0);
      engFindingTotal += count;
      if (sev in rowSeverity) {
        rowSeverity[sev as keyof typeof rowSeverity] = count;
      }
    }

    for (const sev of Object.keys(severityCounts) as Array<
      keyof typeof severityCounts
    >) {
      severityCounts[sev] += rowSeverity[sev] ?? 0;
    }

    const catRows = fetchAll(
      dbPath,
      "SELECT category, COUNT(*) AS count FROM findings GROUP BY category ORDER BY count DESC"
    );
    for (const row of catRows) {
      const cat = stringValue(row.category);
      const count = Number(row.count ?? 0);
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + count);
    }

    const statsRow = fetchOne(
      dbPath,
      `SELECT
        (SELECT COUNT(*) FROM credentials) AS cred_count,
        (SELECT COUNT(*) FROM exploitation_chains) AS chain_count`
    );
    const credCount = Number(statsRow?.cred_count ?? 0);
    const chainCount = Number(statsRow?.chain_count ?? 0);

    totalFindings += engFindingTotal;
    totalCredentials += credCount;
    totalChains += chainCount;

    engagements.push({
      name,
      target: stringValue(engRow?.target, name),
      scan_date: stringValue(engRow?.scan_date),
      total_findings: engFindingTotal,
      critical: rowSeverity.critical,
      high: rowSeverity.high,
      medium: rowSeverity.medium,
      low: rowSeverity.low,
      info: rowSeverity.info,
      total_credentials: credCount,
      total_chains: chainCount
    });
  }

  const categoryCounts = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    engagements,
    severityCounts,
    categoryCounts,
    totals: {
      engagements: engagements.length,
      findings: totalFindings,
      credentials: totalCredentials,
      chains: totalChains
    }
  };
}

export function deleteEngagementDirectory(
  name: string,
  engagementsDir: string = ENGAGEMENTS_DIR
): string {
  const safeName = safeEngagementName(name);
  const path = join(engagementsDir, safeName);
  const dbPath = join(path, "pentest_data.db");
  if (!existsSync(dbPath)) {
    throw new Error(`Unknown engagement: ${safeName}`);
  }
  return path;
}
