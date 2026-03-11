/** @jsxImportSource hono/jsx */
import { BaseLayout } from "./layout.tsx";
import { severityBadge } from "./layout.tsx";
import type { DashboardPageModel } from "../types.ts";

export function DashboardPage(props: { model: DashboardPageModel }) {
  const { model } = props;

  return (
    <BaseLayout
      page="dashboard"
      currentEngagement=""
      title="Cross-Engagement Dashboard — CNH Security Operations"
      scripts={["/static/dashboard.js"]}
    >
      <>
        <div
          class="cnh-card cnh-card-pad cnh-engagement-header animate-in animate-in-1"
          style="margin-bottom:24px;"
        >
          <h1>Cross-Engagement Dashboard</h1>
          <p class="cnh-engagement-meta">
            Aggregate metrics across all engagements
          </p>
        </div>

        <div class="cnh-stat-grid cnh-stat-grid--4" style="margin-bottom:24px;">
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--purple animate-in animate-in-2">
            <p class="cnh-stat-label">Engagements</p>
            <p class="cnh-stat-value">{model.totals.engagements}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--blue animate-in animate-in-3">
            <p class="cnh-stat-label">Total Findings</p>
            <p class="cnh-stat-value">{model.totals.findings}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--orange animate-in animate-in-4">
            <p class="cnh-stat-label">Credentials</p>
            <p class="cnh-stat-value">{model.totals.credentials}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--amber animate-in animate-in-5">
            <p class="cnh-stat-label">Attack Chains</p>
            <p class="cnh-stat-value">{model.totals.chains}</p>
          </div>
        </div>

        <div
          id="dashboard-chart-data"
          style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;"
          data-severity-counts={JSON.stringify(model.severityCounts)}
          data-category-counts={JSON.stringify(model.categoryCounts)}
        >
          <div class="cnh-card cnh-card-pad cnh-chart-card animate-in animate-in-4">
            <p class="cnh-section-label">Findings by Severity</p>
            <div class="chart-container">
              <canvas id="severityChart" />
            </div>
          </div>

          <div class="cnh-card cnh-card-pad cnh-chart-card animate-in animate-in-5">
            <p class="cnh-section-label">Findings by Category</p>
            <div class="chart-container">
              <canvas id="categoryChart" />
            </div>
          </div>
        </div>

        {model.engagements.length > 0 ? (
          <div class="cnh-card animate-in animate-in-5">
            <div class="cnh-card-header">
              <p class="cnh-section-label" style="margin-bottom:0;">
                Engagements
              </p>
            </div>
            <table class="cnh-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Scan Date</th>
                  <th>Findings</th>
                  <th>Severity Breakdown</th>
                  <th>Credentials</th>
                  <th>Chains</th>
                </tr>
              </thead>
              <tbody>
                {model.engagements.map((eng) => (
                  <tr
                    class="dashboard-engagement-row"
                    data-engagement={eng.name}
                    style="cursor:pointer;"
                  >
                    <td style="font-weight:600;color:var(--text-primary);">
                      {eng.target}
                    </td>
                    <td>{eng.scan_date}</td>
                    <td style="font-weight:700;">{eng.total_findings}</td>
                    <td>
                      <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        {eng.critical > 0 ? severityBadge("critical") : null}
                        {eng.critical > 0 ? (
                          <span class="dash-sev-count">{eng.critical}</span>
                        ) : null}
                        {eng.high > 0 ? severityBadge("high") : null}
                        {eng.high > 0 ? (
                          <span class="dash-sev-count">{eng.high}</span>
                        ) : null}
                        {eng.medium > 0 ? severityBadge("medium") : null}
                        {eng.medium > 0 ? (
                          <span class="dash-sev-count">{eng.medium}</span>
                        ) : null}
                        {eng.low > 0 ? severityBadge("low") : null}
                        {eng.low > 0 ? (
                          <span class="dash-sev-count">{eng.low}</span>
                        ) : null}
                        {eng.info > 0 ? severityBadge("info") : null}
                        {eng.info > 0 ? (
                          <span class="dash-sev-count">{eng.info}</span>
                        ) : null}
                        {eng.total_findings === 0 ? (
                          <span style="color:var(--text-tertiary);font-size:0.75rem;">
                            —
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{eng.total_credentials}</td>
                    <td>{eng.total_chains}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            class="cnh-card cnh-card-pad animate-in animate-in-5"
            style="text-align:center;color:var(--text-tertiary);padding:48px 24px;"
          >
            <p style="font-size:0.95rem;font-weight:600;">
              No engagements found
            </p>
            <p style="font-size:0.82rem;margin-top:4px;">
              Start a new scan to create your first engagement.
            </p>
          </div>
        )}
      </>
    </BaseLayout>
  );
}
