# Recon Output Schema Reference

This file contains detailed field documentation for the `recon_output.json` schema.
The main SKILL.md has the full schema structure — this file clarifies field semantics
and edge cases.

## Field Details

### meta.tools_used
List every tool that was actually executed (not just checked for). This helps the
downstream agent understand coverage gaps.

### subdomains[].source
Use consistent source labels:
- `crt.sh` — Certificate Transparency logs
- `subfinder` — subfinder passive enumeration
- `amass` — amass passive enumeration
- `dns_bruteforce` — active DNS wordlist brute-force
- `burp_spider` — discovered via Burp Suite crawler
- `wayback` — found in Wayback Machine archives
- `manual` — user-provided or manually discovered

### ports[].state
Use nmap-style states: `open`, `closed`, `filtered`, `open|filtered`

### potential_vulnerabilities[].severity
Use this scale consistently:
- `info` — interesting observation, not exploitable on its own
- `low` — minor issue, limited impact
- `medium` — notable finding, moderate impact potential
- `high` — significant risk, likely exploitable
- `critical` — immediate risk, trivially exploitable

### endpoints categories
- `directories` — paths discovered via brute-forcing (gobuster, etc.)
- `api_endpoints` — REST/GraphQL/SOAP endpoints
- `admin_panels` — admin interfaces (wp-admin, phpmyadmin, etc.)
- `login_pages` — authentication forms
- `file_exposures` — sensitive files (.env, .git, backups, etc.)
- `js_files` — JavaScript files worth analyzing
- `from_wayback` — historical URLs from Wayback Machine
- `from_robots_txt` — paths listed in robots.txt
- `from_sitemap` — URLs from sitemap.xml
- `from_burp_spider` — endpoints discovered by Burp's crawler

## Multiple Targets

When scanning multiple targets (e.g., a primary domain + several subdomains), produce
one `recon_output.json` per primary target. Subdomains are captured within the parent's
`subdomains` array rather than getting their own top-level output files.
