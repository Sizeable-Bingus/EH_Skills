import Chart from "chart.js/auto";

export type ChartConstructor = {
  new (element: Element, config: unknown): unknown;
  defaults: {
    font: {
      family: string;
      weight: number | string;
    };
  };
};

interface SummaryChartOptions {
  chartDataId: string;
  document?: Document | undefined;
  chartConstructor?: ChartConstructor | undefined;
}

function parseJsonAttribute<T>(value: string | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function initializeSummaryCharts(options: SummaryChartOptions): boolean {
  const documentRef = options.document ?? document;
  const ChartRef = options.chartConstructor ?? Chart;
  const CanvasElement =
    documentRef.defaultView?.HTMLCanvasElement ?? HTMLCanvasElement;
  const chartData = documentRef.getElementById(options.chartDataId);
  if (!chartData) {
    return false;
  }

  ChartRef.defaults.font.family = "'Montserrat', sans-serif";
  ChartRef.defaults.font.weight = 500;

  const severityData = parseJsonAttribute<Record<string, number>>(
    chartData.getAttribute("data-severity-counts") ?? undefined,
    {}
  );
  const categoryData = parseJsonAttribute<
    Array<{ category: string; count: number }>
  >(chartData.getAttribute("data-category-counts") ?? undefined, []);

  const rootStyles =
    documentRef.defaultView?.getComputedStyle?.(documentRef.documentElement) ??
    null;
  const sevColor = (name: string, fallback: string) =>
    rootStyles?.getPropertyValue(`--sev-${name}`).trim() || fallback;

  const severityChart = documentRef.getElementById("severityChart");
  if (severityChart instanceof CanvasElement) {
    new ChartRef(severityChart, {
      type: "doughnut",
      data: {
        labels: ["Critical", "High", "Medium", "Low", "Info"],
        datasets: [
          {
            data: [
              severityData.critical ?? 0,
              severityData.high ?? 0,
              severityData.medium ?? 0,
              severityData.low ?? 0,
              severityData.info ?? 0
            ],
            backgroundColor: [
              sevColor("critical", "#d42a2a"),
              sevColor("high", "#e07314"),
              sevColor("medium", "#f5c542"),
              sevColor("low", "#2567cf"),
              sevColor("info", "#6b7280")
            ],
            borderWidth: 0,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 4 } },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#5a6170",
              font: { size: 12, weight: 500 },
              padding: 16,
              usePointStyle: true
            }
          }
        },
        cutout: "62%"
      }
    });
  }

  const categoryChart = documentRef.getElementById("categoryChart");
  if (categoryChart instanceof CanvasElement) {
    new ChartRef(categoryChart, {
      type: "bar",
      data: {
        labels: categoryData.map((item) => item.category),
        datasets: [
          {
            data: categoryData.map((item) => item.count),
            backgroundColor: "#8b1a1a",
            hoverBackgroundColor: "#c62828",
            borderRadius: 4,
            borderSkipped: false,
            barPercentage: 0.5,
            categoryPercentage: 0.8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#8b919e", font: { size: 11 } },
            grid: { color: "#e2e5ea", lineWidth: 0.5 }
          },
          y: {
            ticks: {
              color: "#5a6170",
              font: { size: 13, weight: 500 },
              autoSkip: false
            },
            grid: { display: false }
          }
        }
      }
    });
  }

  return true;
}
