"""Pentest Report Dashboard — FastAPI application."""

import asyncio
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

try:
    from . import db, pipeline
except ImportError:
    import db
    import pipeline

app = FastAPI(title="Pentest Dashboard")

BASE = Path(__file__).resolve().parent
ENGAGEMENTS_DIR = BASE.parent / "engagements"
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src 'self' data:; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'"
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


def _resolve_db(engagement: str | None) -> tuple[Path, int]:
    if engagement:
        safe = Path(engagement).name  # prevent path traversal
        db_path = ENGAGEMENTS_DIR / safe / "pentest_data.db"
        if not db_path.is_file():
            raise HTTPException(status_code=404, detail=f"Unknown engagement: {safe}")
        return db_path, db.get_latest_engagement_id(db_path)
    return db.DEFAULT_DB, db.get_latest_engagement_id(db.DEFAULT_DB)


def _page_ctx(request: Request, page: str, engagement: str | None, extra: dict) -> dict:
    return {
        "request": request,
        "page": page,
        "current_engagement": engagement or "",
        **extra,
    }


@app.get("/", response_class=HTMLResponse)
def executive_summary(request: Request, engagement: str = Query(default=None)):
    db_path, eid = _resolve_db(engagement)
    return templates.TemplateResponse(
        "executive_summary.html",
        _page_ctx(request, "summary", engagement, db.get_summary_page(db_path, eid)),
    )


@app.get("/findings", response_class=HTMLResponse)
def findings(
    request: Request,
    engagement: str = Query(default=None),
    severity: str = Query(default=None),
    category: str = Query(default=None),
):
    db_path, eid = _resolve_db(engagement)
    return templates.TemplateResponse(
        "findings.html",
        _page_ctx(
            request,
            "findings",
            engagement,
            db.get_findings_page(db_path, eid, severity=severity, category=category),
        ),
    )


@app.get("/chains", response_class=HTMLResponse)
def chains(request: Request, engagement: str = Query(default=None)):
    db_path, eid = _resolve_db(engagement)
    return templates.TemplateResponse(
        "chains.html",
        _page_ctx(request, "chains", engagement, db.get_chains_page(db_path, eid)),
    )


@app.get("/loot", response_class=HTMLResponse)
def loot(request: Request, engagement: str = Query(default=None)):
    db_path, eid = _resolve_db(engagement)
    return templates.TemplateResponse(
        "loot.html",
        _page_ctx(request, "loot", engagement, db.get_loot_page(db_path, eid)),
    )


# --- Pipeline API ---


class StartRequest(BaseModel):
    target: str
    username: str | None = None
    password: str | None = None


@app.post("/api/pipeline/start")
async def pipeline_start(body: StartRequest):
    try:
        await pipeline.start_pipeline(body.target, body.username, body.password)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"status": "started", "target": body.target}


@app.get("/api/pipeline/status")
def pipeline_status():
    st = pipeline.get_state()
    return {
        "status": st.status.value,
        "target": st.target,
        "current_phase": st.current_phase,
        "line_count": len(st.log_lines),
    }


@app.get("/api/pipeline/stream")
async def pipeline_stream():
    q = pipeline.subscribe()

    async def generate():
        try:
            while True:
                line = await asyncio.wait_for(q.get(), timeout=300)
                if line is None:
                    st = pipeline.get_state()
                    payload = json.dumps({
                        "status": st.status.value,
                        "current_phase": st.current_phase,
                        "target": st.target,
                    })
                    yield f"event: done\ndata: {payload}\n\n"
                    break
                yield f"data: {line}\n\n"
        except asyncio.TimeoutError:
            yield "event: done\ndata: {\"status\": \"error\", \"current_phase\": \"Timeout\", \"target\": \"\"}\n\n"
        finally:
            pipeline.unsubscribe(q)

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/engagements")
def list_engagements():
    if not ENGAGEMENTS_DIR.is_dir():
        return JSONResponse([])
    results = sorted(
        d.name
        for d in ENGAGEMENTS_DIR.iterdir()
        if d.is_dir()
        and (d / "pentest_data.db").exists()
        and d.name.lower() != "default"
    )
    return JSONResponse(results)


@app.delete("/api/engagements/{name}")
def delete_engagement(name: str):
    safe = Path(name).name
    eng_dir = ENGAGEMENTS_DIR / safe
    db_path = eng_dir / "pentest_data.db"
    if not db_path.is_file():
        raise HTTPException(status_code=404, detail=f"Unknown engagement: {safe}")

    st = pipeline.get_state()
    if st.status.value == "running" and st.engagement == safe:
        raise HTTPException(status_code=409, detail="Cannot delete while pipeline is running for this target")

    shutil.rmtree(eng_dir)
    return {"status": "deleted", "engagement": safe}
