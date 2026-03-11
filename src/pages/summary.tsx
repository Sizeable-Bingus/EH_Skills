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
            <p class="cnh-stat-label">Total Findings</p>
            <p class="cnh-stat-value">{model.stats.total_findings}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--orange animate-in animate-in-3">
            <p class="cnh-stat-label">Credentials</p>
            <p class="cnh-stat-value">{model.stats.total_credentials}</p>
          </div>
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--amber animate-in animate-in-4">
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
