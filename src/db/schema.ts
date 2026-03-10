export const SCHEMA = `
CREATE TABLE IF NOT EXISTS engagements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    target          TEXT NOT NULL,
    scan_date       TEXT NOT NULL,
    scope_in        TEXT,
    scope_out       TEXT,
    rules           TEXT,
    tools_used      TEXT,
    recon_input     TEXT,
    duration_sec    INTEGER,
    total_vulns     INTEGER DEFAULT 0,
    critical        INTEGER DEFAULT 0,
    high            INTEGER DEFAULT 0,
    medium          INTEGER DEFAULT 0,
    low             INTEGER DEFAULT 0,
    info            INTEGER DEFAULT 0,
    confirmed       INTEGER DEFAULT 0,
    creds_found     INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(target, scan_date)
);

CREATE TABLE IF NOT EXISTS findings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    engagement_id   INTEGER NOT NULL REFERENCES engagements(id),
    name            TEXT,
    category        TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'info',
    status          TEXT NOT NULL DEFAULT 'confirmed',
    url             TEXT,
    parameter       TEXT,
    http_method     TEXT,
    technique       TEXT,
    detail          TEXT,
    evidence        TEXT,
    impact          TEXT,
    remediation     TEXT,
    affected_asset  TEXT,
    raw             TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exploitation_chains (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    engagement_id   INTEGER NOT NULL REFERENCES engagements(id),
    name            TEXT NOT NULL,
    final_impact    TEXT,
    severity        TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chain_steps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id        INTEGER NOT NULL REFERENCES exploitation_chains(id),
    step_order      INTEGER NOT NULL,
    action          TEXT,
    vuln_used       TEXT,
    result          TEXT
);

CREATE TABLE IF NOT EXISTS credentials (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    engagement_id    INTEGER NOT NULL REFERENCES engagements(id),
    source           TEXT,
    username         TEXT,
    password_hash    TEXT,
    password_cracked TEXT,
    service          TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_exfiltrated (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    engagement_id   INTEGER NOT NULL REFERENCES engagements(id),
    source          TEXT,
    record_count    INTEGER,
    data_types      TEXT,
    detail          TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_findings_engagement ON findings(engagement_id);
CREATE INDEX IF NOT EXISTS idx_findings_category   ON findings(category);
CREATE INDEX IF NOT EXISTS idx_findings_severity   ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_status     ON findings(status);
CREATE INDEX IF NOT EXISTS idx_chains_engagement   ON exploitation_chains(engagement_id);
CREATE INDEX IF NOT EXISTS idx_chain_steps_chain   ON chain_steps(chain_id, step_order, id);
CREATE INDEX IF NOT EXISTS idx_creds_engagement    ON credentials(engagement_id);
CREATE INDEX IF NOT EXISTS idx_exfil_engagement    ON data_exfiltrated(engagement_id);
`;
