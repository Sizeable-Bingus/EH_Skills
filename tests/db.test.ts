import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  getChainsPage,
  getDashboardPage,
  getFindingsPage,
  getLatestEngagementId,
  getLootPage,
  getSummaryPage,
} from "../src/db/dashboard.ts";

const fixtureDb = join(
  process.cwd(),
  "engagements",
  "example-com",
  "pentest_data.db",
);

describe("dashboard sqlite shaping", () => {
  const engagementId = getLatestEngagementId(fixtureDb);

  test("loads summary counts", () => {
    const summary = getSummaryPage(fixtureDb, engagementId);
    expect(summary.engagement?.target).toBe("https://example.com");
    expect(summary.stats.total_findings).toBeGreaterThan(0);
    expect(summary.categoryCounts.length).toBeGreaterThan(0);
  });

  test("loads findings filters and raw json", () => {
    const allFindings = getFindingsPage(fixtureDb, engagementId);
    const filterSeverity = allFindings.severities[0] ?? "info";
    const findings = getFindingsPage(fixtureDb, engagementId, {
      severity: filterSeverity,
    });
    expect(findings.curSeverity).toBe(filterSeverity);
    expect(findings.findings.length).toBeGreaterThan(0);
    expect(
      allFindings.findings.some((item) => item.raw !== undefined),
    ).toBeTrue();
  });

  test("loads chains and loot models", () => {
    const chains = getChainsPage(fixtureDb, engagementId);
    const loot = getLootPage(fixtureDb, engagementId);

    expect(chains.chains.length).toBeGreaterThan(0);
    expect(chains.chains[0]?.steps.length).toBeGreaterThan(0);
    expect(loot.credentials.length).toBeGreaterThan(0);
  });
});

describe("cross-engagement dashboard", () => {
  let engagementsDir: string;

  beforeEach(() => {
    engagementsDir = mkdtempSync(join(tmpdir(), "eh-dash-"));
    mkdirSync(join(engagementsDir, "alpha"), { recursive: true });
    cpSync(fixtureDb, join(engagementsDir, "alpha", "pentest_data.db"));
    mkdirSync(join(engagementsDir, "bravo"), { recursive: true });
    cpSync(fixtureDb, join(engagementsDir, "bravo", "pentest_data.db"));
  });

  afterEach(() => {
    rmSync(engagementsDir, { recursive: true, force: true });
  });

  test("aggregates totals across multiple engagements", () => {
    const dashboard = getDashboardPage(engagementsDir);

    expect(dashboard.totals.engagements).toBe(2);
    expect(dashboard.engagements).toHaveLength(2);

    const singleSummary = getSummaryPage(
      join(engagementsDir, "alpha", "pentest_data.db"),
      getLatestEngagementId(join(engagementsDir, "alpha", "pentest_data.db")),
    );
    expect(dashboard.totals.findings).toBe(
      singleSummary.stats.total_findings * 2,
    );
    expect(dashboard.totals.credentials).toBe(
      singleSummary.stats.total_credentials * 2,
    );
    expect(dashboard.totals.chains).toBe(singleSummary.stats.total_chains * 2);
  });

  test("aggregates severity counts across engagements", () => {
    const dashboard = getDashboardPage(engagementsDir);

    const singleSummary = getSummaryPage(
      join(engagementsDir, "alpha", "pentest_data.db"),
      getLatestEngagementId(join(engagementsDir, "alpha", "pentest_data.db")),
    );
    for (const sev of ["critical", "high", "medium", "low", "info"] as const) {
      expect(dashboard.severityCounts[sev]).toBe(
        singleSummary.severityCounts[sev] * 2,
      );
    }
  });

  test("aggregates category counts across engagements", () => {
    const dashboard = getDashboardPage(engagementsDir);
    expect(dashboard.categoryCounts.length).toBeGreaterThan(0);

    const singleSummary = getSummaryPage(
      join(engagementsDir, "alpha", "pentest_data.db"),
      getLatestEngagementId(join(engagementsDir, "alpha", "pentest_data.db")),
    );
    for (const cat of singleSummary.categoryCounts) {
      const dashCat = dashboard.categoryCounts.find(
        (c) => c.category === cat.category,
      );
      expect(dashCat).toBeDefined();
      expect(dashCat!.count).toBe(cat.count * 2);
    }
  });

  test("populates engagement rows with severity breakdown", () => {
    const dashboard = getDashboardPage(engagementsDir);
    const row = dashboard.engagements.find((e) => e.name === "alpha");

    expect(row).toBeDefined();
    expect(row!.target).toBe("https://example.com");
    expect(row!.total_findings).toBeGreaterThan(0);
    expect(row!.critical + row!.high + row!.medium + row!.low + row!.info).toBe(
      row!.total_findings,
    );
  });

  test("returns empty model for empty engagements dir", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "eh-dash-empty-"));
    try {
      const dashboard = getDashboardPage(emptyDir);
      expect(dashboard.totals.engagements).toBe(0);
      expect(dashboard.engagements).toHaveLength(0);
      expect(dashboard.totals.findings).toBe(0);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
