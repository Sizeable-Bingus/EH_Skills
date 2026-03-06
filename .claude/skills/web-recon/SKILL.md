---
name: web-recon
description: >
  Web application reconnaissance skill for authorized penetration testing engagements.
  Performs structured passive and active recon against web targets and outputs
  machine-readable JSON for downstream pentest agents. Use this skill whenever the user
  wants to perform reconnaissance, information gathering, or attack surface mapping
  against a web application target — including subdomain enumeration, technology
  fingerprinting, port scanning, directory discovery, OSINT, or any "recon phase" work.
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
systematically gather intelligence about a web application target and produce structured
JSON output that a downstream exploitation agent can consume directly.

**Authorization requirement**: Before starting any recon, confirm the user has
authorization to test the target. Ask once — a simple "yes" is sufficient. If the user
has already stated authorization context (pentest engagement, scope document, etc.),
that counts.

## High-Level Workflow

1. **Scope Definition** — Confirm the target, boundaries, and any out-of-scope assets
2. **Passive Recon** — Gather intelligence without touching the target directly
3. **Active Recon** — Directly probe the target for detailed technical information
4. **Consolidation** — Merge all findings into the output JSON schema
5. **Handoff** — Write the recon report and summarize key findings for the next phase

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

Passive recon gathers information without sending traffic to the target. This is
lower-risk and often reveals surprising amounts of detail.

### 2.1 DNS Enumeration

Use `dig` or `dnspython` to query:
- A, AAAA, CNAME, MX, NS, TXT, SOA records
- SPF/DMARC/DKIM records (from TXT) — these leak internal mail infrastructure
- Zone transfer attempt (`dig axfr`) — often blocked, but worth trying

```bash
dig +noall +answer <domain> ANY
dig +noall +answer <domain> TXT
dig axfr @<nameserver> <domain>
```

Python fallback:
```python
import dns.resolver
for rtype in ['A', 'AAAA', 'MX', 'NS', 'TXT', 'SOA', 'CNAME']:
    try:
        answers = dns.resolver.resolve(domain, rtype)
        for rdata in answers:
            print(f"{rtype}: {rdata}")
    except Exception:
        pass
```

### 2.2 WHOIS

```bash
whois <domain>
```

Extract: registrar, creation/expiration dates, nameservers, registrant org (if not
redacted). This context helps understand the target's infrastructure age and hosting.

### 2.3 Subdomain Discovery (Passive)

Layer multiple passive sources for coverage:

- **Certificate Transparency**: Query `crt.sh` for issued certificates
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

Check what historical content exists:
```bash
curl -s "https://web.archive.org/cdx/search/cdx?url=*.<domain>/*&output=json&fl=original&collapse=urlkey&limit=500" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for row in data[1:]:  # skip header
    print(row[0])
"
```

Look for: old admin panels, forgotten API endpoints, exposed config files, removed pages
that might still be live.

### 2.5 Google Dorking

Construct targeted search queries. Run these via the user's browser or document them
for manual execution:

- `site:<domain>` — indexed pages
- `site:<domain> filetype:pdf OR filetype:doc OR filetype:xlsx` — documents
- `site:<domain> inurl:admin OR inurl:login OR inurl:dashboard` — admin interfaces
- `site:<domain> inurl:api OR inurl:graphql OR inurl:swagger` — API endpoints
- `site:<domain> ext:env OR ext:config OR ext:yml OR ext:json` — config files

Present these as a list for the user. If `WebSearch` is available, execute them.

### 2.6 Technology Profiling (Passive)

Check public sources:
- **Wappalyzer / BuiltWith** (if API keys available)
- HTTP response headers from a simple GET (this is borderline passive/active — a single
  GET is generally acceptable in authorized engagements)

---

## Phase 3: Active Recon

Active recon directly probes the target. This is where the bulk of technical detail
comes from.

### 3.1 HTTP Fingerprinting

Send requests and analyze responses:

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

Or use `sslyze`/`testssl.sh` if installed for comprehensive analysis.

Look for: certificate SANs (more subdomains!), weak ciphers, outdated TLS versions.

### 3.3 Port Scanning

Use nmap for service discovery:

```bash
# Top 1000 ports, service version detection
nmap -sV -sC --top-ports 1000 -oN nmap_scan.txt <target>
```

For a quicker initial sweep:
```bash
nmap -T4 -F <target>
```

Python fallback (basic TCP connect scan):
```python
import socket
common_ports = [21,22,23,25,53,80,110,135,139,143,443,445,993,995,1433,1521,3306,3389,5432,5900,8080,8443,8888]
for port in common_ports:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    result = sock.connect_ex((target, port))
    if result == 0:
        print(f"Port {port}: OPEN")
    sock.close()
```

### 3.4 Directory and File Discovery

Use gobuster, feroxbuster, or dirsearch:

```bash
gobuster dir -u https://<domain> -w /usr/share/wordlists/dirb/common.txt -t 50 -o dirs.txt
```

Key things to look for:
- `/robots.txt`, `/sitemap.xml` — often reveal hidden paths
- `/.git/`, `/.env`, `/.svn/` — exposed version control or config
- `/api/`, `/graphql`, `/swagger.json`, `/openapi.json` — API documentation
- `/admin`, `/wp-admin`, `/phpmyadmin` — admin panels
- `/backup`, `/old`, `/test` — forgotten resources

### 3.5 Subdomain Validation & Resolution

Take all discovered subdomains and validate them:

```bash
# httpx probes for live HTTP services
echo "<subdomain-list>" | httpx -silent -status-code -title -tech-detect -o live_subs.txt
```

Python fallback:
```python
import requests
for sub in subdomains:
    for scheme in ['https', 'http']:
        try:
            r = requests.get(f"{scheme}://{sub}", timeout=5, allow_redirects=True)
            print(f"{sub} [{r.status_code}] {r.headers.get('server','')}")
            break
        except Exception:
            pass
```

### 3.6 Burp Suite Integration

When a Burp MCP server is available, leverage it for:

- **Spidering/crawling**: Use Burp's crawler to map the application's page structure
  and discover endpoints that static enumeration misses
- **Passive scanning results**: Pull any issues Burp has already identified from
  proxied traffic
- **Sitemap extraction**: Get Burp's sitemap for a comprehensive URL tree
- **Request/response inspection**: Examine interesting requests captured by the proxy

Check for the Burp MCP server's available tools and use them to supplement your own
findings. Burp is particularly good at discovering dynamic content, authenticated
endpoints, and JavaScript-rendered routes.

### 3.7 JavaScript Analysis

Modern web apps ship significant logic in JavaScript. For SPAs especially:

```bash
# Extract JS file URLs from the page source
curl -s https://<domain> | grep -oP 'src="[^"]*\.js[^"]*"' | sed 's/src="//;s/"//'
```

In discovered JS files, search for:
- API endpoints and routes
- Hardcoded keys, tokens, or credentials
- Internal hostnames or IP addresses
- Comments revealing architecture details
- WebSocket endpoints

---

## Phase 4: Consolidation

Merge all findings into the output JSON schema. Every field should be populated with
what was discovered, or set to `null`/empty array if that technique wasn't applicable
or yielded no results.

---

## Phase 5: Handoff

After writing the JSON output file, provide a brief summary highlighting:
- **Attack surface size**: number of live subdomains, open ports, discovered endpoints
- **High-value targets**: admin panels, exposed APIs, misconfigured services
- **Notable findings**: anything unusual, leaked credentials, outdated software
- **Recommended next steps**: what the exploitation agent should prioritize

---

## Output Schema

Write the final output to `recon_output.json`. Use this exact structure:

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
    "tools_used": ["nmap", "subfinder", "..."],
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
  "ports": [
    {
      "host": "<IP or hostname>",
      "port": 443,
      "state": "open",
      "service": "https",
      "version": "nginx 1.18.0",
      "banner": null
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
    "open_ports": 0,
    "total_endpoints": 0,
    "high_value_targets": [],
    "recommended_next_steps": []
  }
}
```

### Output guidelines

- Populate every field you have data for. Use `null` for scalars and `[]` for arrays
  when a technique was run but found nothing.
- The `potential_vulnerabilities` array is for recon-phase observations only — things
  like exposed `.git` directories, default credentials pages, or missing security
  headers. Leave actual vulnerability exploitation to the downstream agent.
- The `summary.recommended_next_steps` array should contain actionable strings that
  tell the next agent what to focus on, e.g.:
  `"Test /api/v1/ endpoints for authentication bypass — no auth observed on GET"`
- Keep raw tool output out of the JSON. If full nmap/gobuster output is needed, write it
  to separate files and reference the paths.

---

## Tool Availability & Fallbacks

Before running a tool, check if it's installed (`which <tool>`). If a preferred tool
is missing, fall back gracefully:

| Preferred        | Fallback                         |
|------------------|----------------------------------|
| `nmap`           | Python socket scan               |
| `subfinder`      | crt.sh API + manual DNS bruteforce |
| `gobuster`       | Python requests + wordlist       |
| `whatweb`        | curl + header analysis           |
| `httpx`          | Python requests probe            |
| `sslyze`         | openssl s_client                 |
| `dig`            | `dnspython` library              |
| Burp MCP         | Manual crawling with curl/requests |

When falling back, note the limitation in the output so the downstream agent knows
the coverage level.

---

## Parallelization Strategy

To keep recon efficient, run independent tasks concurrently using subagents:

- **Parallel group 1** (passive, no target contact):
  DNS enumeration, WHOIS, crt.sh subdomain lookup, Wayback Machine

- **Parallel group 2** (active, after passive completes):
  Port scanning, HTTP fingerprinting, directory brute-forcing, TLS analysis

- **Parallel group 3** (dependent on earlier results):
  Subdomain validation (needs subdomain list), JS analysis (needs endpoint list)

Use the Agent tool to spawn subagents for each independent task when the workload is
large enough to justify it.

---

## Rate Limiting and Stealth

Even in authorized engagements, be a good neighbor:

- Space out requests to avoid overwhelming the target (especially shared hosting)
- Use nmap's `-T3` or `-T4` timing, not `-T5`
- Limit concurrent threads in gobuster/feroxbuster to 50 or fewer
- If the user specifies rate limits in the scope, respect them strictly
