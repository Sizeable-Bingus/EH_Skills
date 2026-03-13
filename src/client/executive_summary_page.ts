import type { ChartConstructor } from "./summary_charts.ts";
import { initializeSummaryCharts } from "./summary_charts.ts";

export interface ExecutiveSummaryDependencies {
  document?: Document;
  chartConstructor?: ChartConstructor;
}

export function initializeExecutiveSummaryPage(
  dependencies: ExecutiveSummaryDependencies = {},
): void {
  initializeSummaryCharts({
    chartDataId: "summary-chart-data",
    document: dependencies.document,
    chartConstructor: dependencies.chartConstructor,
  });
}
