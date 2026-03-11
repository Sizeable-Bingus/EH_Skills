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
              "#d42a2a",
              "#e07314",
              "#c59f07",
              "#2567cf",
              "#9ca3af"
            ],
            borderWidth: 0,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "#5a6170",
              font: { size: 12, weight: 500 },
              padding: 14,
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
            borderSkipped: false
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
            ticks: { color: "#5a6170", font: { size: 11, weight: 500 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  return true;
}
