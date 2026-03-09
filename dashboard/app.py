"""Pentest Report Dashboard — FastAPI application."""

import json

from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path

import db

app = FastAPI(title="Pentest Dashboard")

BASE = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


def _parse_json(value):
    """Safely parse a JSON string, returning the original value on failure."""
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value


@app.get("/", response_class=HTMLResponse)
async def executive_summary(request: Request):
    engagement = db.get_engagement()
    if engagement:
        engagement["tools_used"] = _parse_json(engagement.get("tools_used"))
        engagement["scope_in"] = _parse_json(engagement.get("scope_in"))
    severity_counts = db.get_severity_counts()
    category_counts = db.get_category_counts()
    stats = db.get_stats()
    return templates.TemplateResponse("executive_summary.html", {
        "request": request,
        "engagement": engagement,
        "severity_counts": severity_counts,
        "category_counts": category_counts,
        "stats": stats,
        "page": "summary",
    })


@app.get("/findings", response_class=HTMLResponse)
async def findings(
    request: Request,
    severity: str = Query(default=None),
    category: str = Query(default=None),
    status: str = Query(default=None),
):
    rows = db.get_findings(severity=severity, category=category, status=status)
    for r in rows:
        r["raw"] = _parse_json(r.get("raw"))

    # Collect distinct values for filter dropdowns
    all_rows = db.get_findings()
    severities = sorted(set(r["severity"] for r in all_rows), key=lambda s: db.SEVERITY_ORDER.get(s, 5))
    categories = sorted(set(r["category"] for r in all_rows))
    statuses = sorted(set(r["status"] for r in all_rows))

    return templates.TemplateResponse("findings.html", {
        "request": request,
        "findings": rows,
        "severities": severities,
        "categories": categories,
        "statuses": statuses,
        "cur_severity": severity or "",
        "cur_category": category or "",
        "cur_status": status or "",
        "page": "findings",
    })


@app.get("/chains", response_class=HTMLResponse)
async def chains(request: Request):
    chains_data = db.get_chains_with_steps()
    return templates.TemplateResponse("chains.html", {
        "request": request,
        "chains": chains_data,
        "page": "chains",
    })


@app.get("/loot", response_class=HTMLResponse)
async def loot(request: Request):
    credentials = db.get_credentials()
    exfiltrated = db.get_exfiltrated()
    for e in exfiltrated:
        e["data_types"] = _parse_json(e.get("data_types"))

    cracked = sum(1 for c in credentials if c.get("password_cracked"))
    total_records = sum(e.get("record_count", 0) or 0 for e in exfiltrated)

    return templates.TemplateResponse("loot.html", {
        "request": request,
        "credentials": credentials,
        "exfiltrated": exfiltrated,
        "cracked_count": cracked,
        "total_records": total_records,
        "page": "loot",
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
