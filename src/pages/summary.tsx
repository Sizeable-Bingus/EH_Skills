/** @jsxImportSource hono/jsx */
import { BaseLayout } from "./layout.tsx";
import type { EngagementSummaryViewModel } from "../types.ts";

export function SummaryPage(props: {
  model: EngagementSummaryViewModel;
  currentEngagement: string;
}) {
  const { model, currentEngagement } = props;
  const engagement = model.engagement;

  return (
    <BaseLayout
      page="summary"
      currentEngagement={currentEngagement}
      title="Executive Summary — CNH Security Operations"
      scripts={["/static/executive_summary.js"]}
    >
      <>
        {engagement ? (
          <div
            class="cnh-card cnh-engagement-header cnh-card-pad animate-in animate-in-1"
            style="margin-bottom:24px;"
          >
            <div style="display:flex;align-items:flex-start;justify-content:space-between;">
              <div>
                <h1>{engagement.target}</h1>
                <p class="cnh-engagement-meta">
                  Scan Date: {engagement.scan_date}
                </p>
              </div>
              <div style="text-align:right;">
                {engagement.duration_sec ? (
                  <p class="cnh-engagement-meta">
                    Duration: {(engagement.duration_sec / 60).toFixed(1)} min
                  </p>
                ) : null}
              </div>
            </div>
            {engagement.tools_used?.length ? (
              <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;">
                {engagement.tools_used.map((tool) => (
                  <span class="cnh-tool-badge">{tool}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div class="cnh-stat-grid cnh-stat-grid--3" style="margin-bottom:24px;">
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--blue animate-in animate-in-2">
            <svg
              class="cnh-stat-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p class="cnh-stat-label">Total Findings</p>
            <p class="cnh-stat-value">{model.stats.total_findings}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--orange animate-in animate-in-3">
            <svg
              class="cnh-stat-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            <p class="cnh-stat-label">Credentials</p>
            <p class="cnh-stat-value">{model.stats.total_credentials}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--amber animate-in animate-in-4">
            <svg
              class="cnh-stat-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <p class="cnh-stat-label">Attack Chains</p>
            <p class="cnh-stat-value">{model.stats.total_chains}</p>
          </div>
        </div>

        <div
          id="summary-chart-data"
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

        {engagement?.scope ? (
          <div class="cnh-card cnh-card-pad animate-in animate-in-5">
            <p class="cnh-section-label">Scope</p>
            {typeof engagement.scope === "string" ? (
              <p class="scope-item">{engagement.scope}</p>
            ) : (
              <>
                {engagement.scope.in_scope.length > 0 ? (
                  <>
                    <p class="scope-heading">In Scope</p>
                    <ul style="list-style:none;padding:0;margin:0 0 8px;">
                      {engagement.scope.in_scope.map((item) => (
                        <li class="scope-item mono">{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {engagement.scope.out_of_scope.length > 0 ? (
                  <>
                    <div class="scope-divider" />
                    <p class="scope-heading">Out of Scope</p>
                    <ul style="list-style:none;padding:0;margin:0 0 8px;">
                      {engagement.scope.out_of_scope.map((item) => (
                        <li class="scope-item mono">{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {engagement.scope.rules_of_engagement ? (
                  <>
                    <div class="scope-divider" />
                    <p class="scope-heading">Rules of Engagement</p>
                    <p class="scope-item">
                      {engagement.scope.rules_of_engagement}
                    </p>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </>
    </BaseLayout>
  );
}
