/** @jsxImportSource hono/jsx */
import type { ChainsPageModel } from "../types.ts";
import { BaseLayout, severityBadge } from "./layout.tsx";

export function ChainsPage(props: {
  model: ChainsPageModel;
  currentEngagement: string;
}) {
  const { model, currentEngagement } = props;

  return (
    <BaseLayout
      page="chains"
      currentEngagement={currentEngagement}
      title="Attack Chains — CNH Security Operations"
    >
      <>
        <h1
          class="cnh-page-title animate-in animate-in-1"
          style="margin-bottom:24px;"
        >
          Attack Chains{" "}
          <span class="cnh-page-count">({model.chains.length})</span>
        </h1>

        <div class="chain-space">
          {model.chains.map((chain, index) => (
            <div
              class={`cnh-card cnh-card-pad animate-in animate-in-${index + 2}`}
            >
              <div class="chain-header">
                <div>
                  <h2 class="chain-name">{chain.name}</h2>
                  {chain.final_impact ? (
                    <p class="chain-impact">{chain.final_impact}</p>
                  ) : null}
                </div>
                {severityBadge(chain.severity)}
              </div>

              {chain.steps.length > 0 ? (
                <div class="chain-timeline">
                  {chain.steps.map((step) => (
                    <div class="chain-step">
                      <div class="chain-step-circle">{step.step_order}</div>
                      <div>
                        <p class="chain-step-action">{step.action}</p>
                        {step.vuln_used ? (
                          <span class="chain-vuln-tag">{step.vuln_used}</span>
                        ) : null}
                        {step.result ? (
                          <p class="chain-step-result">↳ {step.result}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </>
    </BaseLayout>
  );
}
