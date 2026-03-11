export type PipelineStatus = "idle" | "running" | "complete" | "error";

export interface StartPipelineRequest {
  target: string;
  username?: string;
  password?: string;
}

export interface PipelineStatusResponse {
  status: PipelineStatus;
  target: string;
  current_phase: string;
  line_count: number;
}

export interface PipelineState {
  status: PipelineStatus;
  target: string;
  engagement: string;
  currentPhase: string;
  logLines: string[];
}

export interface ScopeModel {
  in_scope: string[];
  out_of_scope: string[];
  rules_of_engagement?: string | null;
}

export interface EngagementRecord {
  id: number;
  target: string;
  scan_date: string;
  tools_used?: string[] | null;
  scope?: ScopeModel | string | null;
  duration_sec?: number | null;
}

export interface EngagementSummaryViewModel {
  engagement: EngagementRecord | null;
  severityCounts: Record<
    "critical" | "high" | "medium" | "low" | "info",
    number
  >;
  categoryCounts: Array<{ category: string; count: number }>;
  stats: {
    total_findings: number;
    total_credentials: number;
    total_chains: number;
  };
}

export interface FindingRecord {
  id: number;
  name?: string | null;
  category: string;
  severity: string;
  status: string;
  url?: string | null;
  parameter?: string | null;
  method?: string | null;
  technique?: string | null;
  detail?: string | null;
  evidence?: string | null;
  impact?: string | null;
  remediation?: string | null;
  affected_asset?: string | null;
  raw?: unknown;
}

export interface FindingsPageModel {
  findings: FindingRecord[];
  severities: string[];
  categories: string[];
  curSeverity: string;
  curCategory: string;
}

export interface ChainStepModel {
  id: number;
  step_order: number;
  action?: string | null;
  vuln_used?: string | null;
  result?: string | null;
}

export interface ChainModel {
  id: number;
  name: string;
  final_impact?: string | null;
  severity?: string | null;
  steps: ChainStepModel[];
}

export interface ChainsPageModel {
  chains: ChainModel[];
}

export interface LootCredentialModel {
  technique: string;
  detail: string;
  evidence: string;
}

export interface LootPageModel {
  credentials: LootCredentialModel[];
}

export interface DashboardEngagementRow {
  name: string;
  target: string;
  scan_date: string;
  total_findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total_credentials: number;
  total_chains: number;
}

export interface DashboardPageModel {
  engagements: DashboardEngagementRow[];
  severityCounts: Record<
    "critical" | "high" | "medium" | "low" | "info",
    number
  >;
  categoryCounts: Array<{ category: string; count: number }>;
  totals: {
    engagements: number;
    findings: number;
    credentials: number;
    chains: number;
  };
}

export interface ReconOutput {
  meta: {
    target: string;
    scan_date: string;
    scope?: ScopeModel | null;
    tools_used?: string[] | null;
    recon_duration_seconds?: number | null;
  };
  [key: string]: unknown;
}

export interface ExploitationFinding {
  name: string;
  category: string;
  severity: string;
  status: string;
  url?: string | null;
  parameter?: string | null;
  method?: string | null;
  technique?: string | null;
  detail: string;
  evidence?: string | null;
  impact?: string | null;
  affected_asset?: string | null;
  remediation?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface ExploitationOutput {
  meta: {
    target: string;
    scan_date: string;
    scope?: ScopeModel | null;
    tools_used?: string[] | null;
    recon_input?: string | null;
    exploitation_duration_seconds?: number | null;
  };
  findings: ExploitationFinding[];
  loot?: {
    credentials?: Array<{
      source?: string | null;
      username?: string | null;
      password_hash?: string | null;
      password_cracked?: string | null;
      service?: string | null;
    }>;
    data_exfiltrated?: Array<{
      source?: string | null;
      record_count?: number | null;
      data_types?: string[] | null;
      detail?: string | null;
    }>;
  };
  exploitation_chains?: Array<{
    name: string;
    steps?: Array<{
      order?: number;
      action?: string | null;
      vulnerability_used?: string | null;
      vuln_used?: string | null;
      result?: string | null;
    }>;
    final_impact?: string | null;
    severity?: string | null;
  }>;
}
