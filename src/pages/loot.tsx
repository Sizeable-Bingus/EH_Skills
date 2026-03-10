/** @jsxImportSource hono/jsx */
import type { LootPageModel } from "../types.ts";
import { BaseLayout } from "./layout.tsx";

export function LootPage(props: {
  model: LootPageModel;
  currentEngagement: string;
}) {
  const { model, currentEngagement } = props;

  return (
    <BaseLayout
      page="loot"
      currentEngagement={currentEngagement}
      title="Compromised Credentials — CNH Security Operations"
    >
      <>
        <h1
          class="cnh-page-title animate-in animate-in-1"
          style="margin-bottom:24px;"
        >
          Compromised Credentials
        </h1>

        <div
          class="cnh-stat-grid animate-in animate-in-2"
          style="margin-bottom:24px;"
        >
          <div class="cnh-card cnh-card-pad cnh-stat-card cnh-stat-card--orange">
            <p class="cnh-stat-label">Credentials Found</p>
            <p class="cnh-stat-value">{model.credentials.length}</p>
          </div>
        </div>

        <div class="cnh-card animate-in animate-in-3">
          <div class="cnh-card-header">
            <p class="cnh-section-label" style="margin-bottom:0;">
              Credentials
            </p>
          </div>
          <div style="overflow-x:auto;">
            <table class="cnh-table">
              <thead>
                <tr>
                  <th>Technique</th>
                  <th>Detail</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {model.credentials.map((credential) => (
                  <tr>
                    <td style="font-size:0.78rem;">
                      {credential.technique || "—"}
                    </td>
                    <td style="font-size:0.78rem;max-width:280px;">
                      {credential.detail || "—"}
                    </td>
                    <td style="max-width:360px;">
                      <pre
                        class="mono"
                        style="white-space:pre-wrap;word-break:break-all;font-size:0.72rem;margin:0;color:var(--text-secondary);"
                      >
                        {credential.evidence || "—"}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    </BaseLayout>
  );
}
