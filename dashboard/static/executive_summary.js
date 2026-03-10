function parseJsonAttribute(value, fallback) {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof Chart === "undefined") {
        return;
    }

    const chartData = document.getElementById("summary-chart-data");
    if (!chartData) {
        return;
    }

    /* CNH-aligned chart defaults */
    Chart.defaults.font.family = "'Montserrat', sans-serif";
    Chart.defaults.font.weight = 500;

    const severityData = parseJsonAttribute(chartData.dataset.severityCounts, {});
    const categoryData = parseJsonAttribute(chartData.dataset.categoryCounts, []);

    const severityChart = document.getElementById("severityChart");
    if (severityChart) {
        new Chart(severityChart, {
            type: "doughnut",
            data: {
                labels: ["Critical", "High", "Medium", "Low", "Info"],
                datasets: [{
                    data: [
                        severityData.critical || 0,
                        severityData.high || 0,
                        severityData.medium || 0,
                        severityData.low || 0,
                        severityData.info || 0,
                    ],
                    backgroundColor: [
                        "#d42a2a",  /* critical */
                        "#e07314",  /* high */
                        "#c59f07",  /* medium */
                        "#2567cf",  /* low */
                        "#9ca3af",  /* info */
                    ],
                    borderWidth: 0,
                    hoverOffset: 6,
                }],
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
                            usePointStyle: true,
                        },
                    },
                },
                cutout: "62%",
            },
        });
    }

    const categoryChart = document.getElementById("categoryChart");
    if (categoryChart) {
        new Chart(categoryChart, {
            type: "bar",
            data: {
                labels: categoryData.map((item) => item.category),
                datasets: [{
                    data: categoryData.map((item) => item.count),
                    backgroundColor: "#8b1a1a",
                    hoverBackgroundColor: "#c62828",
                    borderRadius: 4,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: "#8b919e", font: { size: 11 } },
                        grid: { color: "#e2e5ea", lineWidth: 0.5 },
                    },
                    y: {
                        ticks: { color: "#5a6170", font: { size: 11, weight: 500 } },
                        grid: { display: false },
                    },
                },
            },
        });
    }
});
