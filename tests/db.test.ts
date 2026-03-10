import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  getChainsPage,
  getFindingsPage,
  getLatestEngagementId,
  getLootPage,
  getSummaryPage
} from "../src/db/dashboard.ts";

const fixtureDb = join(
  process.cwd(),
  "engagements",
  "example-com",
  "pentest_data.db"
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
      severity: filterSeverity
    });
    expect(findings.curSeverity).toBe(filterSeverity);
    expect(findings.findings.length).toBeGreaterThan(0);
    expect(
      allFindings.findings.some((item) => item.raw !== undefined)
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
