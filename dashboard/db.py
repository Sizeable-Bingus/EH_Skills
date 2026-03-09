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
            engagement["scope_in"] = _parse_json(engagement.get("scope_in"))

        severity_counts = _fetch_one(
            conn,
            "SELECT critical, high, medium, low, info FROM engagements WHERE id = ?",
            (eid,),
        ) or {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}

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
                (SELECT COALESCE(SUM(record_count), 0) FROM data_exfiltrated WHERE engagement_id = ?) AS total_exfil_records,
                (SELECT COUNT(*) FROM data_exfiltrated WHERE engagement_id = ?) AS total_exfil_sources
            """,
            (eid, eid, eid, eid, eid),
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
    status=None,
):
    sql = ["SELECT * FROM findings WHERE engagement_id = ?"]
    params = [eid]

    if severity:
        sql.append("AND severity = ?")
        params.append(severity)
    if category:
        sql.append("AND category = ?")
        params.append(category)
    if status:
        sql.append("AND status = ?")
        params.append(status)

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
        statuses = [
            row["status"]
            for row in _fetch_all(
                conn,
                "SELECT DISTINCT status FROM findings WHERE engagement_id = ? ORDER BY status",
                (eid,),
            )
            if row["status"]
        ]

    return {
        "findings": findings,
        "severities": severities,
        "categories": categories,
        "statuses": statuses,
        "cur_severity": severity or "",
        "cur_category": category or "",
        "cur_status": status or "",
    }


def get_chains_page(db_path=DEFAULT_DB, eid=DEFAULT_ENGAGEMENT_ID):
    with closing(connect(db_path)) as conn:
        rows = _fetch_all(
            conn,
            """
            SELECT
                c.id AS chain_id,
                c.name,
                c.final_impact,
                c.severity,
                s.step_order,
                s.action,
                s.vuln_used,
                s.result
            FROM exploitation_chains AS c
            LEFT JOIN chain_steps AS s ON s.chain_id = c.id
            WHERE c.engagement_id = ?
            ORDER BY c.id, s.step_order
            """,
            (eid,),
        )

    chains_by_id = {}
    for row in rows:
        chain = chains_by_id.setdefault(
            row["chain_id"],
            {
                "id": row["chain_id"],
                "name": row["name"],
                "final_impact": row["final_impact"],
                "severity": row["severity"],
                "steps": [],
            },
        )
        if row["step_order"] is None:
            continue
        chain["steps"].append(
            {
                "step_order": row["step_order"],
                "action": row["action"],
                "vuln_used": row["vuln_used"],
                "result": row["result"],
            }
        )

    return {"chains": list(chains_by_id.values())}


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

    for entry in exfiltrated:
        entry["data_types"] = _parse_json(entry.get("data_types"))

    cracked_count = sum(1 for credential in credentials if credential.get("password_cracked"))
    total_records = sum(entry.get("record_count", 0) or 0 for entry in exfiltrated)

    return {
        "credentials": credentials,
        "exfiltrated": exfiltrated,
        "cracked_count": cracked_count,
        "total_records": total_records,
    }
