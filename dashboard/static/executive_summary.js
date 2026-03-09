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
                    backgroundColor: ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#6b7280"],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "right",
                        labels: { color: "#9ca3af", font: { size: 12 } },
                    },
                },
                cutout: "60%",
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
                    backgroundColor: "#6366f1",
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: "#9ca3af" }, grid: { color: "#1f2937" } },
                    y: { ticks: { color: "#9ca3af", font: { size: 10 } }, grid: { display: false } },
                },
            },
        });
    }
});
