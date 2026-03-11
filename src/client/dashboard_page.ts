import type { ChartConstructor } from "./summary_charts.ts";
import { initializeSummaryCharts } from "./summary_charts.ts";

interface DashboardWindowLike {
  location: { href: string };
}

export interface DashboardPageDependencies {
  document?: Document;
  window?: DashboardWindowLike;
  chartConstructor?: ChartConstructor;
}

export function initializeDashboardPage(
  dependencies: DashboardPageDependencies = {}
): void {
  const documentRef = dependencies.document ?? document;
  const windowRef = dependencies.window ?? window;
  const initialized = initializeSummaryCharts({
    chartDataId: "dashboard-chart-data",
    document: documentRef,
    chartConstructor: dependencies.chartConstructor
  });
  if (!initialized) {
    return;
  }

  const rows = documentRef.querySelectorAll(".dashboard-engagement-row");
  for (const row of rows) {
    row.addEventListener("click", () => {
      const engagement = row.getAttribute("data-engagement");
      if (engagement) {
        windowRef.location.href = `/summary?engagement=${encodeURIComponent(engagement)}`;
      }
    });
  }
}
