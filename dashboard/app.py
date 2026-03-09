"""Pentest Report Dashboard — FastAPI application."""

from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path

import db

app = FastAPI(title="Pentest Dashboard")

BASE = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'"
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.get("/", response_class=HTMLResponse)
def executive_summary(request: Request):
    return templates.TemplateResponse(
        "executive_summary.html",
        {
            "request": request,
            "page": "summary",
            **db.get_summary_page(),
        },
    )


@app.get("/findings", response_class=HTMLResponse)
def findings(
    request: Request,
    severity: str = Query(default=None),
    category: str = Query(default=None),
    status: str = Query(default=None),
):
    return templates.TemplateResponse(
        "findings.html",
        {
            "request": request,
            "page": "findings",
            **db.get_findings_page(severity=severity, category=category, status=status),
        },
    )


@app.get("/chains", response_class=HTMLResponse)
def chains(request: Request):
    return templates.TemplateResponse(
        "chains.html",
        {
            "request": request,
            "page": "chains",
            **db.get_chains_page(),
        },
    )


@app.get("/loot", response_class=HTMLResponse)
def loot(request: Request):
    return templates.TemplateResponse(
        "loot.html",
        {
            "request": request,
            "page": "loot",
            **db.get_loot_page(),
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
