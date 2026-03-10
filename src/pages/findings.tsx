/** @jsxImportSource hono/jsx */
import type { FindingsPageModel } from "../types.ts";
import { BaseLayout, severityBadge } from "./layout.tsx";

export function FindingsPage(props: {
  model: FindingsPageModel;
  currentEngagement: string;
}) {
  const { model, currentEngagement } = props;
  const clearHref = currentEngagement
    ? `/findings?engagement=${encodeURIComponent(currentEngagement)}`
    : "/findings";

  return (
    <BaseLayout
      page="findings"
      currentEngagement={currentEngagement}
      title="Findings — CNH Security Operations"
      scripts={["/static/findings.js"]}
    >
      <>
        <div
          style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;"
          class="animate-in animate-in-1"
        >
          <h1 class="cnh-page-title">
            Findings{" "}
            <span class="cnh-page-count">({model.findings.length})</span>
          </h1>
        </div>

        <form method="get" class="cnh-filter-bar animate-in animate-in-2">
          {currentEngagement ? (
            <input type="hidden" name="engagement" value={currentEngagement} />
          ) : null}
          <select name="severity" class="cnh-filter-select">
            <option value="">All Severities</option>
            {model.severities.map((severity) => (
              <option
                value={severity}
                selected={model.curSeverity === severity}
              >
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </option>
            ))}
          </select>
          <select name="category" class="cnh-filter-select">
            <option value="">All Categories</option>
            {model.categories.map((category) => (
              <option
                value={category}
                selected={model.curCategory === category}
              >
                {category}
              </option>
            ))}
          </select>
          <button type="submit" class="cnh-filter-btn">
            Filter
          </button>
          {model.curSeverity || model.curCategory ? (
            <a href={clearHref} class="cnh-filter-clear">
              Clear
            </a>
          ) : null}
        </form>

        <div class="cnh-card animate-in animate-in-3">
          <table class="cnh-table">
            <thead>
              <tr>
                <th style="width:36px;" />
                <th>Severity</th>
                <th>Finding</th>
                <th>Category</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {model.findings.map((finding) => (
                <>
                  <tr>
                    <td>
                      <button
                        type="button"
                        class="detail-toggle-btn"
                        data-detail-toggle
                        data-id={String(finding.id)}
                        aria-expanded="false"
                        aria-controls={`detail-${finding.id}`}
                      >
                        <span id={`arrow-${finding.id}`} class="detail-arrow">
                          ▶
                        </span>
                      </button>
                    </td>
                    <td>{severityBadge(finding.severity)}</td>
                    <td
                      class="truncate"
                      style="max-width:280px;"
                      title={finding.name ?? finding.technique ?? ""}
                    >
                      {finding.name ?? finding.technique ?? "—"}
                    </td>
                    <td>{finding.category}</td>
                    <td
                      class="mono truncate"
                      style="font-size:0.75rem;max-width:240px;"
                      title={finding.url ?? ""}
                    >
                      {finding.url ?? "—"}
                    </td>
                  </tr>
                  <tr id={`detail-${finding.id}`} class="hidden">
                    <td colSpan={5} class="detail-cell">
                      <div class="detail-grid">
                        {finding.name ? (
                          <div>
                            <p class="detail-field-label">Finding</p>
                            <p class="detail-field-value">{finding.name}</p>
                          </div>
                        ) : null}
                        {finding.technique ? (
                          <div>
                            <p class="detail-field-label">Technique</p>
                            <p class="detail-field-value">
                              {finding.technique}
                            </p>
                          </div>
                        ) : null}
                        {finding.detail ? (
                          <div>
                            <p class="detail-field-label">Detail</p>
                            <p class="detail-field-value">{finding.detail}</p>
                          </div>
                        ) : null}
                        {finding.evidence ? (
                          <div>
                            <p class="detail-field-label">Evidence</p>
                            <p class="detail-field-value">{finding.evidence}</p>
                          </div>
                        ) : null}
                        {finding.impact ? (
                          <div>
                            <p class="detail-field-label">Impact</p>
                            <p class="detail-field-value">{finding.impact}</p>
                          </div>
                        ) : null}
                        {finding.remediation ? (
                          <div>
                            <p class="detail-field-label">Remediation</p>
                            <p class="detail-field-value">
                              {finding.remediation}
                            </p>
                          </div>
                        ) : null}
                        {finding.parameter ? (
                          <div>
                            <p class="detail-field-label">Parameter</p>
                            <p class="detail-field-value mono">
                              {finding.parameter}
                            </p>
                          </div>
                        ) : null}
                        {finding.affected_asset ? (
                          <div>
                            <p class="detail-field-label">Affected Asset</p>
                            <p class="detail-field-value mono">
                              {finding.affected_asset}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      {finding.raw ? (
                        <details class="detail-raw-toggle">
                          <summary>Raw JSON</summary>
                          <pre class="detail-raw-pre">
                            {JSON.stringify(finding.raw, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </>
    </BaseLayout>
  );
}
