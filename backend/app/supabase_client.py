from __future__ import annotations
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import create_client, Client

from app.config import settings

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError(
                "SUPABASE_URL / SUPABASE_SERVICE_KEY are not set. "
                "Copy .env.example to .env and paste your Supabase project keys in."
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------
# zones (static config, seeded once by seed_zones.py)
# ---------------------------------------------------------------

_local = threading.local()

def get_client():
    client = getattr(_local, "client", None)
    if client is None:
        client = create_client(settings.supabase_url, settings.supabase_service_key)  # your existing creation line
        _local.client = client
    return client

def get_zones() -> list[dict[str, Any]]:
    zones = get_client().table("zones").select("*").order("name").execute().data

    # incidentCount is computed live from the incidents table rather than
    # stored/denormalized, so it's never stale.
    counts: dict[str, int] = {}
    rows = get_client().table("incidents").select("zone_id").execute().data
    for row in rows:
        zid = row.get("zone_id")
        if zid:
            counts[zid] = counts.get(zid, 0) + 1

    result = []
    for z in zones:
        result.append(
            {
                "id": z["id"],
                "name": z["name"],
                "category": z["category"],
                "privacyLevel": z["privacy_level"],
                "deviceType": z["device_type"],
                "deviceStatus": z["device_status"],
                "coverageDescription": z["coverage_description"],
                "cctvPermitted": z["cctv_permitted"],
                "incidentCount": counts.get(z["id"], 0),
                "coordinates": z["coordinates"],
                "marker": z["marker"],
            }
        )
    return result


def get_zone_by_id(zone_id: str) -> Optional[dict[str, Any]]:
    zones = get_zones()
    return next((z for z in zones if z["id"] == zone_id), None)


# ---------------------------------------------------------------
# incidents — each row's `doc` column holds the full case record,
# matching the frontend's Incident TS type field-for-field (camelCase
# keys), so routers can hand it back with zero translation.
# ---------------------------------------------------------------
def list_incidents() -> list[dict[str, Any]]:
    rows = (
        get_client()
        .table("incidents")
        .select("doc")
        .order("reported_at", desc=True)
        .execute()
        .data
    )
    return [row["doc"] for row in rows]


def get_incident(incident_id: str) -> Optional[dict[str, Any]]:
    res = (
        get_client()
        .table("incidents")
        .select("doc")
        .eq("id", incident_id)
        .limit(1)
        .execute()
    )
    return res.data[0]["doc"] if res.data else None


def create_incident(doc: dict[str, Any]) -> dict[str, Any]:
    """`doc` must already be the full Incident object (with id, category,
    severity, status, zoneId, reportedAt, updatedAt, etc. set)."""
    row = {
        "id": doc["id"],
        "zone_id": doc.get("zoneId"),
        "severity": doc["severity"],
        "status": doc["status"],
        "reported_at": doc["reportedAt"],
        "updated_at": doc["updatedAt"],
        "doc": doc,
    }
    get_client().table("incidents").insert(row).execute()
    return doc


def update_incident_doc(incident_id: str, doc: dict[str, Any]) -> dict[str, Any]:
    """Overwrites the doc (and the denormalized filter columns) for an
    existing incident. Caller is responsible for mutating `doc` in place
    (status transitions, timeline entries, etc.) before calling this."""
    row = {
        "zone_id": doc.get("zoneId"),
        "severity": doc["severity"],
        "status": doc["status"],
        "updated_at": doc["updatedAt"],
        "doc": doc,
    }
    get_client().table("incidents").update(row).eq("id", incident_id).execute()
    return doc


# ---------------------------------------------------------------
# alerts
# ---------------------------------------------------------------
def list_alerts() -> list[dict[str, Any]]:
    rows = (
        get_client()
        .table("alerts")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return [_alert_row_to_dict(r) for r in rows]


def create_alert(alert: dict[str, Any]) -> dict[str, Any]:
    row = {
        "id": alert["id"],
        "incident_id": alert["incidentId"],
        "title": alert["title"],
        "message": alert["message"],
        "severity": alert["severity"],
        "location": alert["location"],
        "created_at": alert["createdAt"],
        "acknowledged": alert.get("acknowledged", False),
        "read": alert.get("read", False),
    }
    get_client().table("alerts").insert(row).execute()
    return alert


def acknowledge_alert(alert_id: str, actor_name: str) -> Optional[dict[str, Any]]:
    now = utcnow_iso()
    res = (
        get_client()
        .table("alerts")
        .update(
            {
                "acknowledged": True,
                "acknowledged_by": actor_name,
                "acknowledged_at": now,
                "read": True,
            }
        )
        .eq("id", alert_id)
        .execute()
    )
    return _alert_row_to_dict(res.data[0]) if res.data else None


def mark_all_alerts_read() -> None:
    get_client().table("alerts").update({"read": True}).eq("read", False).execute()


def _alert_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "incidentId": row["incident_id"],
        "title": row["title"],
        "message": row["message"],
        "severity": row["severity"],
        "location": row["location"],
        "createdAt": row["created_at"],
        "acknowledged": row["acknowledged"],
        "acknowledgedBy": row.get("acknowledged_by"),
        "acknowledgedAt": row.get("acknowledged_at"),
        "read": row["read"],
    }


# ---------------------------------------------------------------
# audit_log — append-only trail of mutating actions
# ---------------------------------------------------------------
def append_audit_log(entry: dict[str, Any]) -> None:
    row = {
        "id": entry["id"],
        "timestamp": entry["timestamp"],
        "user": entry["user"],
        "role": entry["role"],
        "action": entry["action"],
        "related_incident_id": entry.get("relatedIncidentId"),
        "outcome": entry["outcome"],
        "details": entry["details"],
    }
    get_client().table("audit_log").insert(row).execute()


def list_audit_log(limit: int = 200) -> list[dict[str, Any]]:
    rows = (
        get_client()
        .table("audit_log")
        .select("*")
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [
        {
            "id": r["id"],
            "timestamp": r["timestamp"],
            "user": r["user"],
            "role": r["role"],
            "action": r["action"],
            "relatedIncidentId": r.get("related_incident_id"),
            "outcome": r["outcome"],
            "details": r["details"],
        }
        for r in rows
    ]


# ---------------------------------------------------------------
# sos_alerts
# ---------------------------------------------------------------
def create_sos_alert(payload: dict[str, Any]) -> dict[str, Any]:
    res = get_client().table("sos_alerts").insert(payload).execute()
    return res.data[0]


def list_sos_alerts(status: Optional[str] = None, limit: int = 50) -> list[dict[str, Any]]:
    query = get_client().table("sos_alerts").select("*").order("created_at", desc=True).limit(limit)
    if status:
        query = query.eq("status", status)
    return query.execute().data


def update_sos_alert(alert_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    res = get_client().table("sos_alerts").update(payload).eq("id", alert_id).execute()
    return res.data[0]