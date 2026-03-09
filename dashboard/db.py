"""Read-only query layer for pentest_data.db."""

import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
SEVERITY_ORDER_SQL = (
    "CASE severity "
    "WHEN 'critical' THEN 0 "
    "WHEN 'high' THEN 1 "
    "WHEN 'medium' THEN 2 "
    "WHEN 'low' THEN 3 "
    "WHEN 'info' THEN 4 "
    "ELSE 5 END"
)
DEFAULT_DB = Path(
    os.getenv(
        "PENTEST_DASHBOARD_DB",
        Path(__file__).resolve().parent.parent / "engagements" / "10-3-10-10-1234" / "pentest_data.db",
    )
)


def _get_default_engagement_id():
    try:
        return int(os.getenv("PENTEST_DASHBOARD_ENGAGEMENT_ID", "1"))
    except ValueError:
        return 1


DEFAULT_ENGAGEMENT_ID = _get_default_engagement_id()


def connect(db_path=DEFAULT_DB):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _fetch_all(conn, sql, params=()):
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _fetch_one(conn, sql, params=()):
    row = conn.execute(sql, params).fetchone()
    return dict(row) if row else None


def _parse_json(value):
    if value is None or isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value


def get_summary_page(db_path=DEFAULT_DB, eid=DEFAULT_ENGAGEMENT_ID):
    with closing(connect(db_path)) as conn:
        engagement = _fetch_one(conn, "SELECT * FROM engagements WHERE id = ?", (eid,))
        if engagement:
            engagement["tools_used"] = _parse_json(engagement.get("tools_used"))
            engagement["scope"] = _parse_json(engagement.get("scope"))
            engagement["summary"] = _parse_json(engagement.get("summary"))

        severity_rows = _fetch_all(
            conn,
            "SELECT severity, COUNT(*) AS count FROM findings "
            "WHERE engagement_id = ? GROUP BY severity",
            (eid,),
        )
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for row in severity_rows:
            severity_counts[row["severity"]] = row["count"]

        category_counts = _fetch_all(
            conn,
            "SELECT category, COUNT(*) AS count FROM findings "
            "WHERE engagement_id = ? GROUP BY category ORDER BY count DESC, category",
            (eid,),
        )

        stats = _fetch_one(
            conn,
            """
            SELECT
                (SELECT COUNT(*) FROM findings WHERE engagement_id = ?) AS total_findings,
                (SELECT COUNT(*) FROM credentials WHERE engagement_id = ?) AS total_credentials,
                (SELECT COUNT(*) FROM exploitation_chains WHERE engagement_id = ?) AS total_chains,
                (SELECT COALESCE(SUM(record_count), 0) FROM data_exfiltrated WHERE engagement_id = ?) AS total_exfil_records
            """,
            (eid, eid, eid, eid),
        )

    return {
        "engagement": engagement,
        "severity_counts": severity_counts,
        "category_counts": category_counts,
        "stats": stats,
    }


def get_findings_page(
    db_path=DEFAULT_DB,
    eid=DEFAULT_ENGAGEMENT_ID,
    severity=None,
    category=None,
):
    sql = ["SELECT * FROM findings WHERE engagement_id = ?"]
    params = [eid]

    if severity:
        sql.append("AND severity = ?")
        params.append(severity)
    if category:
        sql.append("AND category = ?")
        params.append(category)

    sql.append(f"ORDER BY {SEVERITY_ORDER_SQL}, category, id")

    with closing(connect(db_path)) as conn:
        findings = _fetch_all(conn, " ".join(sql), params)
        for finding in findings:
            finding["raw"] = _parse_json(finding.get("raw"))

        severities = [
            row["severity"]
            for row in _fetch_all(
                conn,
                f"SELECT DISTINCT severity FROM findings WHERE engagement_id = ? ORDER BY {SEVERITY_ORDER_SQL}",
                (eid,),
            )
            if row["severity"]
        ]
        categories = [
            row["category"]
            for row in _fetch_all(
                conn,
                "SELECT DISTINCT category FROM findings WHERE engagement_id = ? ORDER BY category",
                (eid,),
            )
            if row["category"]
        ]

    return {
        "findings": findings,
        "severities": severities,
        "categories": categories,
        "cur_severity": severity or "",
        "cur_category": category or "",
    }


def get_chains_page(db_path=DEFAULT_DB, eid=DEFAULT_ENGAGEMENT_ID):
    with closing(connect(db_path)) as conn:
        rows = _fetch_all(
            conn,
            "SELECT * FROM exploitation_chains WHERE engagement_id = ? ORDER BY id",
            (eid,),
        )
        step_rows = _fetch_all(
            conn,
            "SELECT * FROM chain_steps WHERE chain_id IN ("
            "SELECT id FROM exploitation_chains WHERE engagement_id = ?"
            ") ORDER BY chain_id, step_order, id",
            (eid,),
        )

    steps_by_chain: dict[int, list[dict]] = {}
    for step in step_rows:
        steps_by_chain.setdefault(step["chain_id"], []).append({
            "id": step["id"],
            "step_order": step["step_order"],
            "action": step["action"],
            "vuln_used": step["vuln_used"],
            "result": step["result"],
        })

    chains = []
    for row in rows:
        chains.append({
            "id": row["id"],
            "name": row["name"],
            "final_impact": row["final_impact"],
            "severity": row["severity"],
            "steps": steps_by_chain.get(row["id"], []),
        })

    return {"chains": chains}


def get_loot_page(db_path=DEFAULT_DB, eid=DEFAULT_ENGAGEMENT_ID):
    with closing(connect(db_path)) as conn:
        credentials = _fetch_all(
            conn,
            "SELECT * FROM credentials WHERE engagement_id = ? ORDER BY id",
            (eid,),
        )
        exfiltrated = _fetch_all(
            conn,
            "SELECT * FROM data_exfiltrated WHERE engagement_id = ? ORDER BY id",
            (eid,),
        )

    normalized_credentials = []
    for credential in credentials:
        detail_parts = [credential.get("username") or "Unknown username"]
        if credential.get("service"):
            detail_parts.append(credential["service"])

        evidence_parts = []
        if credential.get("password_hash"):
            evidence_parts.append(f"Hash: {credential['password_hash']}")
        if credential.get("password_cracked"):
            evidence_parts.append(f"Cracked: {credential['password_cracked']}")

        normalized_credentials.append({
            "url": credential.get("service") or "Credential store",
            "technique": credential.get("source") or "Unknown source",
            "detail": " | ".join(detail_parts),
            "evidence": " | ".join(evidence_parts) or "Captured credential material",
        })

    normalized_exfiltrated = []
    for exfil in exfiltrated:
        data_types = _parse_json(exfil.get("data_types")) or []
        technique = ", ".join(data_types) if isinstance(data_types, list) and data_types else "Data exfiltration"
        evidence = []
        if exfil.get("record_count") is not None:
            evidence.append(f"Records: {exfil['record_count']}")
        if data_types:
            evidence.append(f"Types: {', '.join(data_types)}")

        normalized_exfiltrated.append({
            "url": exfil.get("source") or "Unknown source",
            "technique": technique,
            "detail": exfil.get("detail") or "No detail provided",
            "evidence": " | ".join(evidence) or "Exfiltrated data confirmed",
        })

    return {
        "credentials": normalized_credentials,
        "exfiltrated": normalized_exfiltrated,
    }
