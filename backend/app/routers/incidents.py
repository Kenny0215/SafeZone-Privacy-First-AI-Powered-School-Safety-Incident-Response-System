
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.incident_logic import log_action, new_note, new_timeline_event, now_iso
from app.supabase_client import get_incident, list_incidents, update_incident_doc

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def _require_incident(incident_id: str) -> dict:
    doc = get_incident(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    return doc


@router.get("")
def get_incidents():
    return list_incidents()


@router.get("/{incident_id}")
def get_incident_detail(incident_id: str):
    return _require_incident(incident_id)


class StatusUpdateRequest(BaseModel):
    status: str
    actorName: str
    actorRole: str
    details: Optional[str] = None
    resolutionSummary: Optional[str] = None
    dismissalReason: Optional[str] = None


@router.patch("/{incident_id}/status")
def update_status(incident_id: str, body: StatusUpdateRequest):
    doc = _require_incident(incident_id)
    prev_status = doc["status"]
    doc["status"] = body.status
    doc["updatedAt"] = now_iso()

    if body.status == "Resolved" and body.resolutionSummary:
        doc["resolutionSummary"] = body.resolutionSummary
    if body.status == "Dismissed" and body.dismissalReason:
        doc["dismissalReason"] = body.dismissalReason

    details = body.details or body.resolutionSummary or body.dismissalReason
    event = new_timeline_event(
        body.actorName, body.actorRole, f"Status Changed: {prev_status} → {body.status}", details
    )
    doc["timeline"] = [event] + doc.get("timeline", [])

    update_incident_doc(incident_id, doc)
    log_action(
        body.actorName,
        body.actorRole,
        f"Updated Incident Status to {body.status}",
        details=f'Transitioned case from "{prev_status}" to "{body.status}". {details or ""}',
        related_incident_id=incident_id,
    )
    return doc


class AssignStaffRequest(BaseModel):
    staffName: str
    staffRole: str
    staffEmail: str
    actorName: str
    actorRole: str


@router.patch("/{incident_id}/assign")
def assign_staff(incident_id: str, body: AssignStaffRequest):
    doc = _require_incident(incident_id)
    doc["assignedStaff"] = {"name": body.staffName, "role": body.staffRole, "email": body.staffEmail}
    if doc["status"] in ("New", "Under Review"):
        doc["status"] = "Assigned"
    doc["updatedAt"] = now_iso()

    event = new_timeline_event(
        body.actorName,
        body.actorRole,
        f"Assigned Case to {body.staffName}",
        f"Role: {body.staffRole}. Notification sent to school safety dashboard.",
    )
    doc["timeline"] = [event] + doc.get("timeline", [])

    update_incident_doc(incident_id, doc)
    log_action(
        body.actorName,
        body.actorRole,
        "Staff Member Assigned",
        details=f"Assigned responsibility to {body.staffName} ({body.staffRole}).",
        related_incident_id=incident_id,
    )
    return doc


class PriorityUpdateRequest(BaseModel):
    severity: str
    actorName: str
    actorRole: str
    reason: Optional[str] = None


@router.patch("/{incident_id}/priority")
def change_priority(incident_id: str, body: PriorityUpdateRequest):
    doc = _require_incident(incident_id)
    prev = doc["severity"]
    doc["severity"] = body.severity
    doc["updatedAt"] = now_iso()

    reason = body.reason or "Priority calibrated based on ongoing human evaluation."
    event = new_timeline_event(
        body.actorName, body.actorRole, f"Priority Adjusted: {prev} → {body.severity}", reason
    )
    doc["timeline"] = [event] + doc.get("timeline", [])

    update_incident_doc(incident_id, doc)
    log_action(
        body.actorName,
        body.actorRole,
        f"Priority Changed to {body.severity}",
        details=f"Adjusted severity from {prev} to {body.severity}. Reason: {reason}.",
        related_incident_id=incident_id,
    )
    return doc


class AddNoteRequest(BaseModel):
    content: str
    author: str
    role: str


@router.post("/{incident_id}/notes")
def add_note(incident_id: str, body: AddNoteRequest):
    doc = _require_incident(incident_id)
    note = new_note(body.content, body.author, body.role)
    doc["notes"] = [*doc.get("notes", []), note]
    doc["updatedAt"] = now_iso()

    preview = body.content[:50] + "..." if len(body.content) > 50 else body.content
    event = new_timeline_event(body.author, body.role, "Investigation Note Added", preview)
    doc["timeline"] = [event] + doc.get("timeline", [])

    update_incident_doc(incident_id, doc)
    log_action(
        body.author,
        body.role,
        "Case Investigation Note Appended",
        details=f"Internal case note recorded by {body.author}.",
        related_incident_id=incident_id,
    )
    return doc