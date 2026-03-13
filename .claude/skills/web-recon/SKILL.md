---
name: web-recon
description: >
  Web application reconnaissance skill for authorized penetration testing engagements.
  Performs structured passive and active recon against web targets and outputs
  machine-readable JSON for downstream pentest agents. Use this skill whenever the user
  wants to perform reconnaissance, information gathering, or attack surface mapping
  against a web application target — including subdomain enumeration, technology
  fingerprinting, directory discovery, OSINT, or any "recon phase" work.
  Also trigger when the user provides a target domain/URL and asks to "start a pentest",
  "enumerate", "scan", "fingerprint", or "map the attack surface". This skill is the
  first phase in an AI-driven penetration testing pipeline.
compatibility:
  tools:
    - Bash
    - Write
    - Read
    - Grep
    - Glob
    - Agent
---

# Web Application Recon

You are the recon phase of an authorized penetration testing pipeline. Your job is to
thoroughly map the attack surface of a web application target and produce structured
JSON output that a downstream exploitation agent can consume directly.

Keep all output brief and professional — avoid filler, redundant explanations, or
conversational phrasing. State findings, evidence, and recommendations directly.

## Scope Boundary: Recon Only

Your role is strictly **reconnaissance and attack surface mapping**. You must NOT:

- Attempt to exploit any vulnerability (no SQLi payloads, no XSS probes, no auth bypass attempts)
- Send malicious or crafted payloads to the target (fuzzing, injection strings, etc.)
- Attempt to authenticate with discovered or leaked credentials
- Modify, create, or delete any data on the target
- Attempt to escalate access or pivot to internal systems
- Run Nuclei with exploitation or active-exploit templates

If you discover something that looks exploitable, **document it and move on**. The
exploitation phase is handled by a separate downstream agent. Your value is in the
completeness and accuracy of the map, not in confirming exploitability.

## Output Directory Convention

All output goes under `engagements/<target>/` relative to the project root. Sanitize the
target name for use as a directory name (lowercase, replace dots/colons/slashes with
hyphens, strip protocol). For example, target `https://example.com` becomes
`engagements/example-com/`.

Create the directory structure at the start of every engagement:

```bash
TARGET_DIR="engagements/<sanitized-target>"
mkdir -p "$TARGET_DIR/scans"
```

| File / Dir                              | Contents                              |
|-----------------------------------------|---------------------------------------|
| `$TARGET_DIR/recon_output.json`         | Final structured recon output         |
| `$TARGET_DIR/scans/gobuster_*.txt`      | Directory/file brute-force results    |
| `$TARGET_DIR/scans/nuclei_output.txt`   | Nuclei scan results                   |
| `$TARGET_DIR/scans/live_subs.txt`       | Live subdomain probe results          |
| `$TARGET_DIR/scans/whatweb_*.txt`       | WhatWeb fingerprint output            |

Always use `$TARGET_DIR` when writing any output file. Never write to the project root.

## High-Level Workflow

1. **Scope Definition** — Confirm the target, boundaries, and any out-of-scope assets
2. **Setup** — Create the engagement directory structure
3. **Passive Recon** — Gather intelligence without touching the target directly
4. **Active Recon** — Directly probe the target for detailed technical information
5. **Consolidation** — Merge all findings into the output JSON schema
6. **Handoff** — Write the recon report and summarize key findings for the next phase

Work through each phase sequentially. Within each phase, parallelize where possible
(e.g., run subdomain enumeration and WHOIS lookups concurrently).

---

## Phase 1: Scope Definition

Before any scanning, establish:

- **Primary target(s)**: domain(s), IP(s), URL(s)
- **In-scope assets**: subdomains, IP ranges, specific paths
- **Out-of-scope assets**: anything the user explicitly excludes
- **Rules of engagement**: rate limits, time windows, restricted techniques

Store scope as a JSON object — you'll include it in the final output.

---

## Phase 2: Passive Recon

### 2.1 DNS Enumeration

Query with `dig` or `dnspython`:
- A, AAAA, CNAME, MX, NS, TXT, SOA records
- SPF/DMARC/DKIM records (from TXT) — these leak internal mail infrastructure
- Zone transfer attempt (`dig axfr`) — often blocked, but worth trying

```bash
dig +noall +answer <domain> ANY
dig +noall +answer <domain> TXT
dig axfr @<nameserver> <domain>
```

### 2.2 WHOIS

```bash
whois <domain>
```

Extract: registrar, creation/expiration dates, nameservers, registrant org.

### 2.3 Subdomain Discovery (Passive)

- **Certificate Transparency**: Query `crt.sh`
  ```bash
  curl -s "https://crt.sh/?q=%25.<domain>&output=json" | python3 -c "
  import json, sys
  certs = json.load(sys.stdin)
  subs = set()
  for c in certs:
      for name in c.get('name_value','').split('\n'):
          name = name.strip().lstrip('*.')
          if name: subs.add(name)
  for s in sorted(subs): print(s)
  "
  ```

- **subfinder** (if installed): `subfinder -d <domain> -silent`
- **amass** (if installed): `amass enum -passive -d <domain>`

Deduplicate results across all sources.

### 2.4 Wayback Machine / Web Archives

```bash
curl -s "https://web.archive.org/cdx/search/cdx?url=*.<domain>/*&output=json&fl=original&collapse=urlkey&limit=500" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for row in data[1:]:  # skip header
    print(row[0])
"
```

Look for old admin panels, forgotten API endpoints, exposed config files.

### 2.5 Google Dorking

- `site:<domain>` — indexed pages
- `site:<domain> filetype:pdf OR filetype:doc OR filetype:xlsx` — documents
- `site:<domain> inurl:admin OR inurl:login OR inurl:dashboard` — admin interfaces
- `site:<domain> inurl:api OR inurl:graphql OR inurl:swagger` — API endpoints
- `site:<domain> ext:env OR ext:config OR ext:yml OR ext:json` — config files

If `WebSearch` is available, execute them.

### 2.6 Technology Profiling (Passive)

- **Wappalyzer / BuiltWith** (if API keys available)
- HTTP response headers from a simple GET

---

## Phase 3: Active Recon

### 3.1 HTTP Fingerprinting

```bash
curl -sI https://<domain> | head -30
```

Capture:
- Server header (Apache, nginx, IIS, etc.)
- X-Powered-By, X-AspNet-Version, X-Generator
- Set-Cookie (session naming conventions reveal frameworks)
- Content-Security-Policy, CORS headers
- Security headers present/absent (HSTS, X-Frame-Options, X-Content-Type-Options)

If **whatweb** is available:
```bash
whatweb -v <url>
```

### 3.2 TLS/SSL Analysis

```bash
# Check certificate details and supported protocols
openssl s_client -connect <domain>:443 -servername <domain> </dev/null 2>/dev/null | openssl x509 -noout -text
```

Or use `sslyze`/`testssl.sh` if installed. Look for: extra SANs, weak ciphers, outdated TLS.

### 3.3 Directory and File Discovery

Use gobuster, feroxbuster, or dirsearch:

```bash
gobuster dir -u https://<domain> -w SecLists/Discovery/Web-Content/common.txt -t 50 -o "$TARGET_DIR/scans/gobuster_common.txt"
```

**Wildcard / soft-404 gotcha**: Some sites return HTTP 200 for every path (e.g., a
catch-all route or custom 404 page). Gobuster will warn about this. When it happens,
note the response size from the warning and re-run with `--exclude-length` to filter
out the false positives:

```bash
gobuster dir -u https://<domain> -w SecLists/Discovery/Web-Content/common.txt -t 50 --exclude-length 1234 -o "$TARGET_DIR/scans/gobuster_common.txt"
```

Key things to look for:
- `/robots.txt`, `/sitemap.xml` — often reveal hidden paths
- `/.git/`, `/.env`, `/.svn/` — exposed version control or config
- `/api/`, `/graphql`, `/swagger.json`, `/openapi.json` — API documentation
- `/admin`, `/wp-admin`, `/phpmyadmin` — admin panels
- `/backup`, `/old`, `/test` — forgotten resources

**Wordlist selection** (all under `SecLists/Discovery/Web-Content/`):
- `common.txt` — quick first pass (~4,700 entries), good for a fast sweep
- `raft-medium-directories.txt` / `raft-medium-files.txt` — broader coverage, good default for thorough scans
- `directory-list-2.3-medium.txt` — large general-purpose list for deep coverage

Start with `common.txt` for speed, then escalate to raft or directory-list if the
initial pass looks thin.

### 3.4 Subdomain Validation & Resolution

```bash
# httpx probes for live HTTP services
echo "<subdomain-list>" | httpx -silent -status-code -title -tech-detect -o "$TARGET_DIR/scans/live_subs.txt"
```

### 3.5 Virtual Host (VHOST) Discovery

Sites on the same IP distinguished by `Host` header won't appear in DNS-based subdomain
enumeration. Brute-force with gobuster's `vhost` mode:

```bash
gobuster vhost -u https://<target-IP-or-domain> -w SecLists/Discovery/DNS/subdomains-top1million-5000.txt --append-domain -t 50
```

Use `--exclude-length` to filter false positives (same technique as directory brute-forcing).
Add any discovered vhosts to the subdomains list.

### 3.6 Burp Suite Integration

When a Burp MCP server is available, use it for:
- Spidering/crawling to discover dynamic and JS-rendered endpoints
- Pulling passive scan results and sitemap
- Inspecting captured requests/responses

### 3.7 JavaScript Analysis

```bash
# Extract JS file URLs from the page source
curl -s https://<domain> | grep -oP 'src="[^"]*\.js[^"]*"' | sed 's/src="//;s/"//'
```

In discovered JS files, search for:
- API endpoints and routes
- Hardcoded keys, tokens, or credentials (document them — do NOT test or use them)
- Internal hostnames or IP addresses
- Comments revealing architecture details
- WebSocket endpoints

### 3.8 Nuclei Scanning

Run nuclei against each discovered domain/vhost using **detection-only** templates.
Exclude any templates that send exploit payloads or attempt active exploitation:

```bash
nuclei -l "$TARGET_DIR/scans/live_subs.txt" -t ~/nuclei-templates \
  -tags exposure,misconfig,tech,token,cve \
  -severity info,low,medium,high \
  -exclude-tags exploit,rce,dos,fuzz \
  -o "$TARGET_DIR/scans/nuclei_output.txt"
```

The goal is **detection and fingerprinting**, not exploitation. Feed results into the
`potential_vulnerabilities` array as observations for the downstream exploitation agent
to investigate.

---

## Phase 4: Consolidation

Merge all findings into the output JSON schema.

---

## Phase 5: Handoff

After writing the JSON output file, provide a brief summary highlighting:
- **Attack surface size**: number of live subdomains, discovered endpoints
- **High-value targets**: admin panels, exposed APIs, misconfigured services
- **Notable findings**: anything unusual, potential credential exposure, outdated software
- **Recommended next steps**: what the exploitation agent should prioritize

Your job ends here. Do not proceed to test, validate, or exploit any findings. The
downstream exploitation agent will consume `recon_output.json` and handle that phase.

---

## Output Schema

Write the final output to `$TARGET_DIR/recon_output.json`. Use this exact structure:

```json
{
  "meta": {
    "target": "<primary domain or URL>",
    "scan_date": "<ISO 8601 timestamp>",
    "scope": {
      "in_scope": ["<domain>", "<IP range>", "..."],
      "out_of_scope": ["..."],
      "rules_of_engagement": "<any constraints>"
    },
    "tools_used": ["subfinder", "gobuster", "..."],
    "recon_duration_seconds": null
  },
  "dns": {
    "records": {
      "A": [],
      "AAAA": [],
      "MX": [],
      "NS": [],
      "TXT": [],
      "SOA": [],
      "CNAME": []
    },
    "zone_transfer_possible": false,
    "nameservers": []
  },
  "whois": {
    "registrar": null,
    "creation_date": null,
    "expiration_date": null,
    "nameservers": [],
    "registrant_org": null,
    "raw": "<full whois output>"
  },
  "subdomains": [
    {
      "hostname": "<subdomain>",
      "ip": "<resolved IP>",
      "source": "<how discovered: crt.sh, subfinder, etc.>",
      "http_status": null,
      "title": null,
      "server": null,
      "technologies": []
    }
  ],
  "web_technologies": {
    "server": null,
    "framework": null,
    "language": null,
    "cms": null,
    "javascript_frameworks": [],
    "cdn": null,
    "waf": null,
    "headers": {},
    "cookies": []
  },
  "tls": {
    "certificate": {
      "subject": null,
      "issuer": null,
      "sans": [],
      "valid_from": null,
      "valid_to": null
    },
    "protocols": [],
    "weak_ciphers": [],
    "issues": []
  },
  "endpoints": {
    "directories": [],
    "api_endpoints": [],
    "admin_panels": [],
    "login_pages": [],
    "file_exposures": [],
    "js_files": [],
    "from_wayback": [],
    "from_robots_txt": [],
    "from_sitemap": [],
    "from_burp_spider": []
  },
  "js_analysis": {
    "api_routes_found": [],
    "hardcoded_secrets": [],
    "internal_hosts": [],
    "websocket_endpoints": [],
    "interesting_comments": []
  },
  "security_headers": {
    "hsts": null,
    "csp": null,
    "x_frame_options": null,
    "x_content_type_options": null,
    "x_xss_protection": null,
    "cors": null,
    "missing": []
  },
  "potential_vulnerabilities": [
    {
      "type": "<category: e.g., exposed_config, outdated_software, missing_header>",
      "severity": "<info|low|medium|high|critical>",
      "detail": "<description>",
      "evidence": "<what was observed>",
      "affected_asset": "<URL, host, or subdomain>"
    }
  ],
  "osint": {
    "google_dorks_results": [],
    "wayback_interesting_urls": [],
    "leaked_credentials": false,
    "paste_sites": [],
    "notes": null
  },
  "summary": {
    "total_subdomains": 0,
    "live_subdomains": 0,
    "total_endpoints": 0,
    "high_value_targets": [],
    "recommended_next_steps": []
  }
}
```

### Output guidelines

- Use `null` for scalars and `[]` for arrays when a technique found nothing.
- `potential_vulnerabilities` is for **recon observations only** — things you can see without
  sending exploit payloads (exposed `.git`, missing headers, outdated version strings, etc.).
  Never confirm exploitability; just document what you observed and let the exploitation agent
  investigate.
- `summary.recommended_next_steps`: actionable strings for the downstream agent.
- Keep raw tool output in `$TARGET_DIR/scans/`, not in the JSON.

---

## Tool Availability & Fallbacks

Check with `which <tool>` before use. Fallbacks:

| Preferred        | Fallback                         |
|------------------|----------------------------------|
| `subfinder`      | crt.sh API + manual DNS bruteforce |
| `gobuster`       | Python requests + wordlist       |
| `whatweb`        | curl + header analysis           |
| `httpx`          | Python requests probe            |
| `sslyze`         | openssl s_client                 |
| `dig`            | `dnspython` library              |
| Burp MCP         | Manual crawling with curl/requests |

Note any fallback limitations in the output.

---

## Parallelization Strategy

Run independent tasks concurrently using subagents:

- **Parallel group 1** (passive, no target contact):
  DNS enumeration, WHOIS, crt.sh subdomain lookup, Wayback Machine

- **Parallel group 2** (active, after passive completes):
  HTTP fingerprinting, directory brute-forcing, TLS analysis

- **Parallel group 3** (dependent on earlier results):
  Subdomain validation (needs subdomain list), JS analysis (needs endpoint list)

Use the Agent tool to spawn subagents when the workload justifies it.

