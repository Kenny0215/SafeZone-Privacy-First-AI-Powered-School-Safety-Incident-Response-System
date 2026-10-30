"""
Backs the "SOS button" screen for private zones (toilets, changing
rooms) where there's no CCTV — a manual trigger that notifies the
teacher/person-in-charge, as the supervisor asked for.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.models.schemas import SosCreateRequest, SosOut, SosUpdateRequest
from app.notifications import send_telegram_alert
from app.supabase_client import create_sos_alert, list_sos_alerts, update_sos_alert, utcnow_iso

router = APIRouter(prefix="/api/sos", tags=["sos"])


@router.post("", response_model=SosOut)
def trigger_sos(body: SosCreateRequest, background_tasks: BackgroundTasks):
    row = create_sos_alert(
        {
            "camera_location": body.camera_location,
            "triggered_by": body.triggered_by,
            "message": body.message,
            "linked_incident_id": body.linked_incident_id,
            "status": "open",
        }
    )

    # An SOS press is always HIGH. Telegram goes to the staff group as a background task, so a slow or
    # failed Telegram can never delay or break the SOS itself. Only the place is sent: not who pressed
    # it, and not their message.
    row_id = row.get("id") if isinstance(row, dict) else None
    background_tasks.add_task(
        send_telegram_alert,
        zone_name=body.camera_location,
        severity="high",
        reason="SOS button pressed: a student is asking for help",
        incident_id=body.linked_incident_id or row_id or "SOS",
    )
    return row


@router.get("", response_model=list[SosOut])
def get_sos_alerts(status: str | None = Query(None, description="open | acknowledged | resolved")):
    return list_sos_alerts(status=status)


@router.patch("/{alert_id}", response_model=SosOut)
def patch_sos_alert(alert_id: str, body: SosUpdateRequest):
    payload = {"status": body.status}
    if body.status == "acknowledged":
        payload["acknowledged_by"] = body.acknowledged_by
        payload["acknowledged_at"] = utcnow_iso()
    elif body.status == "resolved":
        payload["resolved_at"] = utcnow_iso()
    try:
        return update_sos_alert(alert_id, payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(404, f"Alert not found or update failed: {exc}") from exc