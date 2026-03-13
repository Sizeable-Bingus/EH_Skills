import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { ingestExploitationOutput } from "../db/ingest.ts";
import type {
  ExploitationFinding,
  ExploitationOutput,
  ReconOutput,
} from "../types.ts";
import { phaseHeader } from "../utils.ts";
import type { PipelineExecutionContext, SyntheticArtifacts } from "./types.ts";

function baseHost(target: string): string {
  return target.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function makeFinding(
  name: string,
  category: string,
  severity: string,
  detail: string,
  extra: Partial<
    Omit<ExploitationFinding, "name" | "category" | "severity" | "detail">
  > = {},
): ExploitationFinding {
  return {
    name,
    category,
    severity,
    detail,
    status: extra.status ?? "confirmed",
    url: extra.url ?? null,
    parameter: extra.parameter ?? null,
    method: extra.method ?? null,
    technique: extra.technique ?? null,
    evidence: extra.evidence ?? null,
    impact: extra.impact ?? null,
    affected_asset: extra.affected_asset ?? null,
    remediation: extra.remediation ?? null,
    attributes: extra.attributes ?? null,
  };
}

export function createSyntheticArtifacts(
  target: string,
  reconPath: string,
): SyntheticArtifacts {
  const now = new Date().toISOString();
  const host = baseHost(target);

  const recon: ReconOutput = {
    meta: {
      target,
      scan_date: now,
      scope: {
        in_scope: [target],
        out_of_scope: [],
        rules_of_engagement: "SYNTHETIC TEST DATA — not a real engagement",
      },
      tools_used: ["synthetic-test-generator"],
      recon_duration_seconds: 0,
    },
    dns: {
      records: {
        A: ["192.0.2.1"],
        AAAA: [],
        MX: ["mail.test.synthetic.example"],
        NS: ["ns1.test.synthetic.example"],
        TXT: ["v=spf1 include:_spf.synthetic.example ~all"],
        SOA: ["ns1.test.synthetic.example admin.test.synthetic.example"],
        CNAME: [],
      },
      zone_transfer_possible: false,
      nameservers: ["ns1.test.synthetic.example"],
    },
    whois: {
      registrar: "Synthetic Test Registrar Inc.",
      creation_date: "2020-01-01T00:00:00Z",
      expiration_date: "2030-01-01T00:00:00Z",
      nameservers: ["ns1.test.synthetic.example"],
      registrant_org: "Synthetic Test Corp",
      raw: "SYNTHETIC WHOIS DATA — not real",
    },
    subdomains: [
      {
        hostname: `www.${host}`,
        ip: "192.0.2.1",
        source: "crt.sh",
        http_status: 200,
        title: "SYNTHETIC Test Application",
        server: "nginx/1.18.0",
        technologies: ["nginx", "PHP/8.1", "jQuery/3.6"],
      },
      {
        hostname: `api.${host}`,
        ip: "192.0.2.2",
        source: "subfinder",
        http_status: 200,
        title: "SYNTHETIC API Gateway",
        server: "Express",
        technologies: ["Node.js", "Express"],
      },
      {
        hostname: `admin.${host}`,
        ip: "192.0.2.1",
        source: "dns_bruteforce",
        http_status: 403,
        title: "SYNTHETIC Admin Panel",
        server: "nginx/1.18.0",
        technologies: ["nginx", "PHP/8.1"],
      },
    ],
    ports: [
      {
        host: "192.0.2.1",
        port: 80,
        state: "open",
        service: "http",
        version: "nginx 1.18.0",
        banner: null,
      },
      {
        host: "192.0.2.1",
        port: 443,
        state: "open",
        service: "https",
        version: "nginx 1.18.0",
        banner: null,
      },
      {
        host: "192.0.2.1",
        port: 22,
        state: "filtered",
        service: "ssh",
        version: null,
        banner: null,
      },
      {
        host: "192.0.2.1",
        port: 3306,
        state: "filtered",
        service: "mysql",
        version: null,
        banner: null,
      },
      {
        host: "192.0.2.2",
        port: 443,
        state: "open",
        service: "https",
        version: "Node.js Express",
        banner: null,
      },
    ],
    web_technologies: {
      server: "nginx/1.18.0",
      framework: "Laravel",
      language: "PHP 8.1",
      cms: null,
      javascript_frameworks: ["jQuery 3.6", "Vue.js 3.2"],
      cdn: null,
      waf: null,
      headers: {
        Server: "nginx/1.18.0",
        "X-Powered-By": "PHP/8.1",
        "Content-Type": "text/html; charset=UTF-8",
      },
      cookies: [
        { name: "PHPSESSID", flags: ["HttpOnly"] },
        { name: "remember_token", flags: [] },
      ],
    },
    tls: {
      certificate: {
        subject: `CN=${host}`,
        issuer: "CN=Synthetic Test CA",
        sans: [host],
        valid_from: "2024-01-01T00:00:00Z",
        valid_to: "2026-12-31T23:59:59Z",
      },
      protocols: ["TLSv1.2", "TLSv1.3"],
      weak_ciphers: [],
      issues: [],
    },
    endpoints: {
      directories: ["/admin", "/api", "/uploads", "/static"],
      api_endpoints: [
        "/api/v1/users",
        "/api/v1/products",
        "/api/v1/orders",
        "/api/v1/auth/login",
      ],
      admin_panels: ["/admin/login", "/admin/dashboard"],
      login_pages: ["/login", "/admin/login"],
      file_exposures: ["/robots.txt", "/.env.example"],
      js_files: ["/static/js/app.js", "/static/js/vendor.js"],
      from_wayback: ["/old-admin", "/backup"],
      from_robots_txt: ["/admin", "/api/internal"],
      from_sitemap: ["/products", "/about", "/contact"],
      from_burp_spider: ["/api/v1/health", "/api/v1/debug"],
    },
    js_analysis: {
      api_routes_found: ["/api/v1/users", "/api/v1/internal/config"],
      hardcoded_secrets: ["SYNTHETIC_API_KEY=sk-test-not-real-12345"],
      internal_hosts: ["192.0.2.10"],
      websocket_endpoints: ["wss://ws.synthetic.example/live"],
      interesting_comments: [
        "// TODO: SYNTHETIC remove debug endpoint before prod",
      ],
    },
    security_headers: {
      hsts: null,
      csp: null,
      x_frame_options: "SAMEORIGIN",
      x_content_type_options: "nosniff",
      x_xss_protection: null,
      cors: "Access-Control-Allow-Origin: *",
      missing: [
        "Strict-Transport-Security",
        "Content-Security-Policy",
        "X-XSS-Protection",
      ],
    },
    potential_vulnerabilities: [
      {
        type: "missing_header",
        severity: "low",
        detail:
          "SYNTHETIC: Missing HSTS header allows potential downgrade attacks",
        evidence: "No Strict-Transport-Security header in response",
        affected_asset: target,
      },
      {
        type: "exposed_config",
        severity: "medium",
        detail:
          "SYNTHETIC: .env.example file exposed — may leak configuration patterns",
        evidence: "HTTP 200 on /.env.example",
        affected_asset: `${target}/.env.example`,
      },
      {
        type: "cors_wildcard",
        severity: "medium",
        detail: "SYNTHETIC: Wildcard CORS policy allows any origin",
        evidence: "Access-Control-Allow-Origin: *",
        affected_asset: `${target}/api/v1/`,
      },
      {
        type: "hardcoded_secret",
        severity: "high",
        detail: "SYNTHETIC: API key found hardcoded in JavaScript bundle",
        evidence:
          "SYNTHETIC_API_KEY=sk-test-not-real-12345 in /static/js/app.js",
        affected_asset: `${target}/static/js/app.js`,
      },
    ],
    osint: {
      google_dorks_results: [
        "SYNTHETIC: site:example found test page at /debug",
      ],
      wayback_interesting_urls: [`${target}/old-admin`],
      leaked_credentials: false,
      paste_sites: [],
      notes: "SYNTHETIC TEST DATA — no real OSINT was performed",
    },
    summary: {
      total_subdomains: 3,
      live_subdomains: 2,
      open_ports: 4,
      total_endpoints: 18,
      high_value_targets: [
        `admin.${host} — admin panel`,
        `api.${host} — API gateway`,
      ],
      recommended_next_steps: [
        "SYNTHETIC: Test /admin/login for default credentials",
        "SYNTHETIC: Test API endpoints for injection vulnerabilities",
        "SYNTHETIC: Investigate hardcoded API key in JS bundle",
      ],
    },
  };

  const exploitation: ExploitationOutput = {
    meta: {
      target,
      scan_date: now,
      scope: {
        in_scope: [target],
        out_of_scope: [],
        rules_of_engagement: "SYNTHETIC TEST DATA — not a real engagement",
      },
      tools_used: ["synthetic-test-generator"],
      recon_input: reconPath,
      exploitation_duration_seconds: 0,
    },
    findings: [
      makeFinding(
        "Admin panel accepts default credentials",
        "authentication",
        "high",
        "SYNTHETIC: /admin/login accepts the default admin credential set.",
        {
          url: `${target}/admin/login`,
          technique: "default_password",
          evidence:
            "SYNTHETIC: POST /admin/login with admin:SYNTHETIC_password123 returned 302 to /admin/dashboard",
          impact: "SYNTHETIC: Full admin access to the application.",
          affected_asset: `${target}/admin/login`,
          remediation:
            "SYNTHETIC: Disable default accounts and enforce password rotation before deployment.",
          attributes: {
            username: "admin",
            password: "SYNTHETIC_password123",
            access_level: "admin",
          },
        },
      ),
      makeFinding(
        "JWT none algorithm accepted",
        "authentication",
        "high",
        "SYNTHETIC: The API accepts unsigned JWT tokens.",
        {
          url: `${target}/api/v1/users`,
          technique: "jwt_none",
          evidence:
            "SYNTHETIC: Sent JWT with alg:none and received 200 with user data.",
          impact:
            "SYNTHETIC: Attackers can forge authenticated requests without a signing secret.",
          affected_asset: `${target}/api/v1/users`,
          remediation:
            "SYNTHETIC: Reject alg:none and pin accepted JWT algorithms server-side.",
          attributes: { access_level: "user" },
        },
      ),
      makeFinding(
        "Session cookie missing Secure and HttpOnly flags",
        "authentication",
        "low",
        "SYNTHETIC: remember_token is issued without Secure or HttpOnly protections.",
        {
          evidence: "SYNTHETIC: Set-Cookie: remember_token=abc123; Path=/",
          affected_asset: target,
          remediation:
            "SYNTHETIC: Mark session cookies Secure, HttpOnly, and SameSite.",
          attributes: {
            issue_type: "missing_flags",
            cookie_name: "remember_token",
          },
        },
      ),
      makeFinding(
        "JWT validation allows unsafe algorithm configuration",
        "authentication",
        "low",
        "SYNTHETIC: Token validation accepts an unsafe algorithm choice.",
        {
          evidence:
            'SYNTHETIC: Modified JWT header to {"alg":"none"}, server returned 200.',
          affected_asset: `${target}/api/v1/users`,
          remediation:
            "SYNTHETIC: Enforce strong JWT validation and explicit algorithm allowlists.",
          attributes: { issue_type: "jwt_none" },
        },
      ),
      makeFinding(
        "Union SQL injection in product id",
        "injection",
        "critical",
        "SYNTHETIC: The product id parameter is injectable with UNION queries.",
        {
          url: `${target}/api/v1/products`,
          parameter: "id",
          method: "GET",
          technique: "union",
          evidence:
            "SYNTHETIC: id=1 UNION SELECT 1,2,version()-- returned MySQL 8.0.32.",
          impact:
            "SYNTHETIC: Full database read access and user-table extraction.",
          affected_asset: `${target}/api/v1/products`,
          remediation:
            "SYNTHETIC: Parameterize queries and enforce server-side input validation.",
          attributes: {
            dbms: "mysql",
            payload: "1 UNION SELECT 1,2,version()--",
            sqlmap_output: null,
          },
        },
      ),
      makeFinding(
        "Reflected XSS in product search",
        "injection",
        "medium",
        "SYNTHETIC: The search parameter is reflected without output encoding.",
        {
          url: `${target}/products`,
          parameter: "search",
          technique: "reflected",
          evidence:
            '<script>alert("SYNTHETIC_XSS")</script> rendered in the response body.',
          impact:
            "SYNTHETIC: Session theft or arbitrary script execution in the victim browser.",
          affected_asset: `${target}/products`,
          remediation:
            "SYNTHETIC: Apply context-aware output encoding and input validation.",
          attributes: {
            payload: '<script>alert("SYNTHETIC_XSS")</script>',
            context: "html_body",
          },
        },
      ),
      makeFinding(
        "Stored XSS in order notes",
        "injection",
        "high",
        "SYNTHETIC: Order note content is stored and later rendered in the admin dashboard.",
        {
          url: `${target}/api/v1/orders`,
          parameter: "note",
          method: "POST",
          technique: "stored",
          evidence:
            '<img src=x onerror=alert("SYNTHETIC_STORED_XSS")> executed in /admin/orders.',
          impact:
            "SYNTHETIC: Persistent script execution against administrative users.",
          affected_asset: `${target}/admin/orders`,
          remediation:
            "SYNTHETIC: Sanitize stored HTML and encode untrusted output on render.",
          attributes: {
            payload: '<img src=x onerror=alert("SYNTHETIC_STORED_XSS")>',
            context: "html_body",
          },
        },
      ),
      makeFinding(
        "Path traversal in file API",
        "file_access",
        "high",
        "SYNTHETIC: The file path parameter allows directory traversal outside the intended root.",
        {
          url: `${target}/api/v1/files`,
          parameter: "path",
          technique: "relative_path_traversal",
          evidence:
            "SYNTHETIC: ../../etc/passwd returned file content from the host filesystem.",
          impact: "SYNTHETIC: Arbitrary local file read.",
          affected_asset: `${target}/api/v1/files`,
          remediation:
            "SYNTHETIC: Canonicalize paths and enforce an allowlisted base directory.",
          attributes: {
            payload: "../../etc/passwd",
            files_read: ["/etc/passwd"],
          },
        },
      ),
      makeFinding(
        "IDOR exposes other user profiles",
        "authorization",
        "medium",
        "SYNTHETIC: Sequential user IDs expose other users' profile records.",
        {
          url: `${target}/api/v1/users/2`,
          parameter: "user_id",
          method: "GET",
          technique: "sequential_id",
          evidence:
            "SYNTHETIC: GET /api/v1/users/2 returned the profile for jane_doe.",
          impact:
            "SYNTHETIC: Unauthorized access to another user's email and address data.",
          affected_asset: `${target}/api/v1/users/2`,
          remediation:
            "SYNTHETIC: Enforce object ownership checks on every user lookup.",
          attributes: { idor_type: "horizontal" },
        },
      ),
      makeFinding(
        "Mass assignment enables admin role escalation",
        "authorization",
        "critical",
        "SYNTHETIC: A standard user can set their own role to admin through the profile API.",
        {
          url: `${target}/api/v1/users/1`,
          method: "PUT",
          technique: "mass_assignment",
          evidence:
            'SYNTHETIC: PUT /api/v1/users/1 with {"role":"admin"} returned 200.',
          impact: "SYNTHETIC: Full administrative privileges.",
          affected_asset: `${target}/api/v1/users/1`,
          remediation:
            "SYNTHETIC: Denylist privileged fields and enforce authorization on role changes.",
          attributes: {
            from_role: "user",
            to_role: "admin",
            escalation_type: "vertical",
          },
        },
      ),
      makeFinding(
        "Internal config endpoint exposed without authentication",
        "authorization",
        "medium",
        "SYNTHETIC: The internal configuration endpoint is reachable without authentication.",
        {
          url: `${target}/api/v1/internal/config`,
          method: "GET",
          evidence:
            "SYNTHETIC: GET /api/v1/internal/config returned 200 as an unauthenticated client.",
          impact:
            "SYNTHETIC: Sensitive operational data is exposed to unauthenticated users.",
          affected_asset: `${target}/api/v1/internal/config`,
          remediation:
            "SYNTHETIC: Require authentication and authorization for internal endpoints.",
          attributes: { expected_auth: "Admin authentication required" },
        },
      ),
      makeFinding(
        "Login API missing rate limiting",
        "configuration",
        "low",
        "SYNTHETIC: The login API accepts rapid credential attempts without throttling.",
        {
          url: `${target}/api/v1/auth/login`,
          method: "POST",
          evidence:
            "SYNTHETIC: 20 rapid login requests completed without 429 or lockout behavior.",
          impact:
            "SYNTHETIC: Enables brute-force attacks against user accounts.",
          affected_asset: `${target}/api/v1/auth/login`,
          remediation:
            "SYNTHETIC: Add per-account and per-IP throttling with lockout controls.",
          attributes: {
            tested_endpoints: [
              `${target}/login`,
              `${target}/api/v1/auth/login`,
            ],
          },
        },
      ),
      makeFinding(
        "SSRF reaches cloud metadata service",
        "ssrf",
        "critical",
        "SYNTHETIC: The URL fetch endpoint can request internal metadata resources.",
        {
          url: `${target}/api/v1/fetch`,
          parameter: "url",
          technique: "server_side_request",
          evidence:
            "SYNTHETIC: Requesting 169.254.169.254 returned AWS metadata content.",
          impact:
            "SYNTHETIC: Cloud credential theft and internal network access.",
          affected_asset: `${target}/api/v1/fetch`,
          remediation:
            "SYNTHETIC: Enforce outbound allowlists and block link-local/internal destinations.",
          attributes: {
            payload: "http://169.254.169.254/latest/meta-data/",
            internal_access: "AWS metadata endpoint",
            cloud_metadata: true,
          },
        },
      ),
      makeFinding(
        "CORS reflects arbitrary origins with credentials",
        "configuration",
        "medium",
        "SYNTHETIC: The API reflects attacker-controlled Origin headers while allowing credentials.",
        {
          url: `${target}/api/v1/`,
          technique: "origin_reflection",
          evidence:
            "SYNTHETIC: Origin: https://evil.example -> ACAO: https://evil.example and ACAC: true.",
          impact:
            "SYNTHETIC: Credentialed cross-origin requests can be abused from attacker origins.",
          affected_asset: `${target}/api/v1/`,
          remediation:
            "SYNTHETIC: Replace origin reflection with an explicit allowlist and disable credentials where unnecessary.",
          attributes: { cors_type: "arbitrary_origin" },
        },
      ),
      makeFinding(
        "Server version disclosed in headers",
        "configuration",
        "low",
        "SYNTHETIC: Response headers disclose precise server and framework versions.",
        {
          evidence: "SYNTHETIC: Server: nginx/1.18.0, X-Powered-By: PHP/8.1",
          affected_asset: target,
          remediation:
            "SYNTHETIC: Remove or generalize version-bearing response headers.",
        },
      ),
      makeFinding(
        "Outdated client-side library with known exposure",
        "configuration",
        "medium",
        "SYNTHETIC: jQuery 3.6 appears outdated relative to known client-side issues.",
        {
          status: "likely",
          evidence: "SYNTHETIC: jQuery/3.6 detected in page source.",
          affected_asset: `${target}/static/js/vendor.js`,
          remediation:
            "SYNTHETIC: Upgrade jQuery to the latest approved stable version.",
        },
      ),
    ],
    loot: {
      credentials: [
        {
          source: "SYNTHETIC: MySQL database via SQLi",
          username: "admin",
          password_hash:
            "$2y$10$SYNTHETIC_HASH_NOT_REAL_abcdefghijklmnopqrstuv",
          password_cracked: null,
          service: "web application",
        },
        {
          source: "SYNTHETIC: MySQL database via SQLi",
          username: "api_service",
          password_hash:
            "$2y$10$SYNTHETIC_HASH_NOT_REAL_wxyzabcdefghijklmnopqrs",
          password_cracked: null,
          service: "internal API",
        },
      ],
      data_exfiltrated: [
        {
          source: "SYNTHETIC: users table via SQL injection",
          record_count: 150,
          data_types: ["PII", "credentials"],
          detail:
            "SYNTHETIC: Extracted 150 user records including emails, hashed passwords, and addresses",
        },
      ],
    },
    exploitation_chains: [
      {
        name: "SYNTHETIC: SQLi to Admin Takeover",
        steps: [
          {
            order: 1,
            action:
              "SYNTHETIC: Exploited union-based SQLi in /api/v1/products?id=",
            vulnerability_used: "sqli",
            result:
              "SYNTHETIC: Enumerated administrator accounts and backend schema details",
          },
          {
            order: 2,
            action: "SYNTHETIC: Logged into admin panel at /admin/login",
            vulnerability_used: "default_creds",
            result: "SYNTHETIC: Full admin access to application",
          },
        ],
        final_impact:
          "SYNTHETIC: Complete admin takeover — access to all user data and application settings",
        severity: "critical",
      },
      {
        name: "SYNTHETIC: SSRF to Cloud Metadata",
        steps: [
          {
            order: 1,
            action:
              "SYNTHETIC: Sent SSRF payload to /api/v1/fetch?url=http://169.254.169.254/",
            vulnerability_used: "ssrf",
            result: "SYNTHETIC: Retrieved AWS metadata endpoint listing",
          },
          {
            order: 2,
            action: "SYNTHETIC: Fetched IAM role credentials from metadata",
            vulnerability_used: "ssrf",
            result: "SYNTHETIC: Obtained temporary AWS access keys",
          },
        ],
        final_impact:
          "SYNTHETIC: AWS IAM credential theft via SSRF — potential cloud account compromise",
        severity: "critical",
      },
    ],
  };

  return { recon: recon as Record<string, unknown>, exploitation };
}

export async function runSyntheticPipeline(
  context: PipelineExecutionContext,
): Promise<void> {
  mkdirSync(context.engagementDir, { recursive: true });

  const reconPath = join(context.engagementDir, "recon_output.json");
  const exploitationPath = join(
    context.engagementDir,
    "exploitation_output.json",
  );
  const dbPath = join(context.engagementDir, "pentest_data.db");

  for (const line of phaseHeader("Web Reconnaissance (SYNTHETIC)")) {
    context.log(line);
  }
  if (context.username || context.password) {
    context.log(
      `[creds] Username: ${context.username ?? "(none)"}, Password: ${context.password ? "***" : "(none)"}`,
    );
  }

  const artifacts = createSyntheticArtifacts(context.target, reconPath);
  await Bun.write(reconPath, JSON.stringify(artifacts.recon, null, 2));
  context.log(`[ok] Wrote synthetic recon → ${reconPath}`);
  context.log("");
  context.log("--- Web Reconnaissance complete ---");

  for (const line of phaseHeader("Web Exploitation (SYNTHETIC)")) {
    context.log(line);
  }
  if (context.username || context.password) {
    context.log(
      `[creds] Username: ${context.username ?? "(none)"}, Password: ${context.password ? "***" : "(none)"}`,
    );
  }

  if (context.username) {
    artifacts.exploitation.findings.push(
      makeFinding(
        "Supplied credentials validated",
        "authentication",
        "info",
        "SYNTHETIC: User-supplied credentials authenticated successfully during setup.",
        {
          url: `${context.target}/login`,
          method: "POST",
          technique: "interactive_login",
          evidence:
            "SYNTHETIC: Login succeeded with the supplied username and password.",
          affected_asset: `${context.target}/login`,
          attributes: { username: context.username },
        },
      ),
    );
  }

  await Bun.write(
    exploitationPath,
    JSON.stringify(artifacts.exploitation, null, 2),
  );
  context.log(`[ok] Wrote synthetic exploitation → ${exploitationPath}`);
  ingestExploitationOutput(artifacts.exploitation, dbPath, {
    force: true,
    includeAll: true,
  });

  context.log("");
  context.log(`${"=".repeat(60)}`);
  context.log("  PIPELINE COMPLETE (SYNTHETIC TEST DATA)");
  context.log(`${"=".repeat(60)}`);
  context.log(`Results: ${context.engagementDir}/`);
}
