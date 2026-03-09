"""Read-only query layer for pentest_data.db."""

import sqlite3
from pathlib import Path

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

DEFAULT_DB = Path(__file__).resolve().parent.parent / "engagements" / "10-3-10-10-1234" / "pentest_data.db"


def _query(db_path, sql, params=()):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _query_one(db_path, sql, params=()):
    rows = _query(db_path, sql, params)
    return rows[0] if rows else None


def get_engagement(db_path=DEFAULT_DB, eid=1):
    return _query_one(db_path, "SELECT * FROM engagements WHERE id = ?", (eid,))


def get_severity_counts(db_path=DEFAULT_DB, eid=1):
    row = _query_one(
        db_path,
        "SELECT critical, high, medium, low, info FROM engagements WHERE id = ?",
        (eid,),
    )
    return row or {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}


def get_category_counts(db_path=DEFAULT_DB, eid=1):
    return _query(
        db_path,
        "SELECT category, COUNT(*) as count FROM findings "
        "WHERE engagement_id = ? GROUP BY category ORDER BY count DESC",
        (eid,),
    )


def get_findings(db_path=DEFAULT_DB, eid=1, severity=None, category=None, status=None):
    sql = (
        "SELECT * FROM findings WHERE engagement_id = ?"
    )
    params = [eid]

    if severity:
        sql += " AND severity = ?"
        params.append(severity)
    if category:
        sql += " AND category = ?"
        params.append(category)
    if status:
        sql += " AND status = ?"
        params.append(status)

    sql += (
        " ORDER BY CASE severity "
        "WHEN 'critical' THEN 0 WHEN 'high' THEN 1 "
        "WHEN 'medium' THEN 2 WHEN 'low' THEN 3 "
        "WHEN 'info' THEN 4 ELSE 5 END, category"
    )
    return _query(db_path, sql, params)


def get_chains_with_steps(db_path=DEFAULT_DB, eid=1):
    chains = _query(
        db_path,
        "SELECT * FROM exploitation_chains WHERE engagement_id = ? ORDER BY id",
        (eid,),
    )
    for chain in chains:
        chain["steps"] = _query(
            db_path,
            "SELECT * FROM chain_steps WHERE chain_id = ? ORDER BY step_order",
            (chain["id"],),
        )
    return chains


def get_credentials(db_path=DEFAULT_DB, eid=1):
    return _query(
        db_path,
        "SELECT * FROM credentials WHERE engagement_id = ? ORDER BY id",
        (eid,),
    )


def get_exfiltrated(db_path=DEFAULT_DB, eid=1):
    return _query(
        db_path,
        "SELECT * FROM data_exfiltrated WHERE engagement_id = ? ORDER BY id",
        (eid,),
    )


def get_stats(db_path=DEFAULT_DB, eid=1):
    def _count(table):
        r = _query_one(db_path, f"SELECT COUNT(*) as c FROM {table} WHERE engagement_id = ?", (eid,))
        return r["c"] if r else 0

    chains_count = _query_one(
        db_path,
        "SELECT COUNT(*) as c FROM exploitation_chains WHERE engagement_id = ?",
        (eid,),
    )
    exfil = _query_one(
        db_path,
        "SELECT COALESCE(SUM(record_count), 0) as total FROM data_exfiltrated WHERE engagement_id = ?",
        (eid,),
    )

    return {
        "total_findings": _count("findings"),
        "total_credentials": _count("credentials"),
        "total_chains": chains_count["c"] if chains_count else 0,
        "total_exfil_records": exfil["total"] if exfil else 0,
        "total_exfil_sources": _count("data_exfiltrated"),
    }
