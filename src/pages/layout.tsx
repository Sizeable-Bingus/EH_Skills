/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";

type PageKey = "summary" | "findings" | "chains" | "loot";

interface LayoutProps {
  page: PageKey;
  currentEngagement: string;
  title: string;
  children: Child;
  scripts?: string[];
}

function pageHref(path: string, engagement: string): string {
  if (!engagement) {
    return path;
  }
  return `${path}?engagement=${encodeURIComponent(engagement)}`;
}

export function BaseLayout({
  page,
  currentEngagement,
  title,
  children,
  scripts = []
}: LayoutProps) {
  const navItems: Array<[PageKey, string, string]> = [
    ["summary", "/", "Executive Summary"],
    ["findings", "/findings", "Findings"],
    ["chains", "/chains", "Attack Chains"],
    ["loot", "/loot", "Compromised Credentials"]
  ];

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href="/static/styles.css" />
      </head>
      <body>
        <nav class="cnh-nav">
          <div class="cnh-nav-inner">
            <div class="cnh-logo">
              <div class="cnh-logo-mark">CNH</div>
              <span class="cnh-logo-sub">Security Operations</span>
              <div class="cnh-logo-divider" />
            </div>

            <div style="display:flex;align-items:center;">
              <div class="cnh-nav-links">
                {navItems.map(([key, href, label]) => (
                  <a
                    href={pageHref(href, currentEngagement)}
                    class={`cnh-nav-link ${page === key ? "cnh-nav-link--active" : ""}`}
                  >
                    {label}
                  </a>
                ))}
              </div>

              <div class="cnh-nav-controls">
                <div class="combobox" id="engagement-combobox">
                  <svg
                    class="combobox-search-icon"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="rgba(255,255,255,0.4)"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="text"
                    id="engagement-input"
                    class="combobox-input"
                    placeholder="Search engagements..."
                    autoComplete="off"
                    role="combobox"
                    aria-expanded="false"
                    aria-controls="engagement-listbox"
                  />
                  <ul
                    id="engagement-listbox"
                    class="combobox-listbox hidden"
                    role="listbox"
                  />
                </div>
                <button
                  id="delete-engagement"
                  class="cnh-btn-danger-icon hidden"
                  title="Delete engagement"
                  type="button"
                >
                  <svg
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
                <button id="scan-open" class="cnh-btn-primary" type="button">
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New Scan
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div id="pipeline-status" class="hidden pipeline-bar">
          <div class="pipeline-bar-inner">
            <span id="pipeline-dot" class="pipeline-dot pipeline-dot--idle" />
            <span id="pipeline-text" class="pipeline-text">
              Idle
            </span>
            <button id="log-toggle" class="pipeline-log-toggle" type="button">
              Show Log
            </button>
          </div>
          <div id="log-panel" class="hidden pipeline-log-panel">
            <pre id="log-pre" class="pipeline-log-pre" />
          </div>
        </div>

        <div id="scan-modal" class="hidden cnh-modal-overlay">
          <div class="cnh-modal" style="max-width:520px;">
            <h2>Start New Scan</h2>
            <div class="scan-warning">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <circle
                  cx="12"
                  cy="17"
                  r="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              <div>
                <strong>Authorized Targets Only</strong>
                <p>
                  <strong>
                    Scanning is strictly limited to CNH-owned development and
                    staging environments.
                  </strong>{" "}
                  Production sites are prohibited. The target must be a
                  CNH-owned asset deployed in a development environment.
                  Third-party, vendor, or partner systems are not authorized.
                  Unauthorized scanning will be logged, flagged, and may result
                  in disciplinary action.
                </p>
              </div>
            </div>
            <label>Target URL</label>
            <input
              id="scan-target"
              type="text"
              placeholder="https://dev.example.cnh.com"
              class="cnh-input"
            />
            <label style="margin-top:16px">
              Username{" "}
              <span style="opacity:.5;font-weight:400">(optional)</span>
            </label>
            <input
              id="scan-username"
              type="text"
              placeholder="admin"
              class="cnh-input"
            />
            <label style="margin-top:16px">
              Password{" "}
              <span style="opacity:.5;font-weight:400">(optional)</span>
            </label>
            <input
              id="scan-password"
              type="password"
              placeholder="••••••••"
              class="cnh-input"
            />
            <div class="cnh-modal-actions">
              <button id="scan-cancel" class="cnh-btn-ghost" type="button">
                Cancel
              </button>
              <button
                id="scan-start"
                class="cnh-btn-modal-primary"
                type="button"
              >
                Start Scan
              </button>
            </div>
          </div>
        </div>

        <div id="delete-modal" class="hidden cnh-modal-overlay">
          <div class="cnh-modal" style="max-width:440px;">
            <h2>Delete Engagement</h2>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 8px;">
              This action cannot be undone. All scan data, findings, and
              credentials for the following engagement will be permanently
              removed:
            </p>
            <p
              style="font-size:0.95rem;font-weight:700;color:var(--text-primary);margin:0 0 20px;"
              id="delete-target-name"
            />
            <div class="cnh-modal-actions">
              <button id="delete-cancel" class="cnh-btn-ghost" type="button">
                Cancel
              </button>
              <button
                id="delete-confirm"
                class="cnh-btn-modal-danger"
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <main class="cnh-main">{children}</main>
        <script type="module" src="/static/pipeline.js" />
        {scripts.map((script) => (
          <script type="module" src={script} />
        ))}
      </body>
    </html>
  );
}

export function severityBadge(severity?: string | null) {
  const classes: Record<string, string> = {
    critical: "sev-badge--critical",
    high: "sev-badge--high",
    medium: "sev-badge--medium",
    low: "sev-badge--low",
    info: "sev-badge--info"
  };

  return (
    <span class={`sev-badge ${classes[severity ?? ""] ?? "sev-badge--info"}`}>
      <span class="sev-dot" />
      {severity ?? "info"}
    </span>
  );
}
