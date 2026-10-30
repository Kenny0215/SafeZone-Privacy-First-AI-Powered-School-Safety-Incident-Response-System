
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.incident_logic import log_action
from app.supabase_client import acknowledge_alert, list_alerts, mark_all_alerts_read

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def get_alerts():
    return list_alerts()


class AcknowledgeRequest(BaseModel):
    actorName: str
    actorRole: str = "School Safety Staff"


@router.patch("/{alert_id}/acknowledge")
def acknowledge(alert_id: str, body: AcknowledgeRequest):
    updated = acknowledge_alert(alert_id, body.actorName)
    if not updated:
        raise HTTPException(404, "Alert not found")
    log_action(
        body.actorName,
        body.actorRole,
        "Alert Acknowledged",
        details=f"Staff member acknowledged alert {alert_id}.",
        related_incident_id=updated.get("incidentId"),
    )
    return updated


@router.patch("/mark-all-read")
def mark_all_read():
    mark_all_alerts_read()
    return {"ok": True}