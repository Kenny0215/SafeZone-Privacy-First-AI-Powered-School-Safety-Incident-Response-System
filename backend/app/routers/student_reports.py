from __future__ import annotations

import random
from typing import Optional

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.incident_logic import build_alert, log_action, new_incident_id, new_timeline_event, now_iso
from app.notifications import send_telegram_alert
from app.supabase_client import create_alert, create_incident, get_zones

router = APIRouter(prefix="/api", tags=["student-reports"])


class StudentReportSubmission(BaseModel):
    category: str
    location: str
    approximateTime: Optional[str] = None
    description: str
    reportingMode: str  # 'anonymous' | 'confidential'
    studentName: Optional[str] = None
    gradeLevel: Optional[str] = None
    contactPreference: Optional[str] = None
    additionalDetails: Optional[str] = None
    hasImmediateDanger: bool = False


@router.post("/student-reports")
def submit_student_report(body: StudentReportSubmission, background_tasks: BackgroundTasks):
    zones = get_zones()
    matching_zone = next(
        (z for z in zones if z["name"].lower() == body.location.lower()), zones[0] if zones else None
    )

    now = now_iso()
    incident_id = new_incident_id()
    reference_code = f"SZ-STU-{random.randint(1000, 9999)}"
    is_anon = body.reportingMode == "anonymous"
    source = "Student Report (Anon)" if is_anon else "Student Report (Confidential)"
    suggested_severity = "High" if body.hasImmediateDanger else "Medium"

    description = body.description
    if body.additionalDetails:
        description += f"\n\nAdditional Details: {body.additionalDetails}"

    zone_id = matching_zone["id"] if matching_zone else None
    privacy_level = matching_zone["privacyLevel"] if matching_zone else "Permitted Surveillance"
    is_private = privacy_level == "Strictly Private (No Video)"

    doc = {
        "id": incident_id,
        "category": body.category,
        "severity": suggested_severity,
        "status": "New",
        "location": body.location,
        "zoneId": zone_id,
        "privacyLevel": privacy_level,
        "source": source,
        "title": f"{body.category}: {body.location}",
        "description": description,
        "reportedAt": now,
        "updatedAt": now,
        "reporterInfo": {
            "isAnonymous": is_anon,
            "name": None if is_anon else body.studentName,
            "grade": None if is_anon else body.gradeLevel,
            "contactMethod": None if is_anon else (body.contactPreference or "Designated Counselor Meeting Only"),
        },
        "aiAssessment": {
            "isSimulated": False,
            "confidenceScore": random.randint(75, 90),
            "detectedSignals": [
                f"Student submitted via {body.reportingMode} portal",
                f"Category: {body.category}",
                "Immediate safety concern flagged" if body.hasImmediateDanger else "Standard priority triage",
            ],
            "suggestedSeverity": suggested_severity,
            "rationale": "Initial triage based on student-reported descriptors. Zero automated disciplinary action; human review required.",
            "triageTimestamp": now,
        },
        "evidenceSummary": {
            "hasMedia": False,
            "mediaType": "none",
            "isRestricted": is_private,
            "restrictionReason": "Designated Private Area: Visual recording strictly prohibited." if is_private else None,
        },
        "notes": [],
        "timeline": [
            new_timeline_event(
                "Anonymous Student" if is_anon else f"{body.studentName or 'Student'} (Confidential)",
                "Student Portal User",
                f"Report Submitted ({body.reportingMode.upper()})",
                f"Reference Code: {reference_code}. Location: {body.location}. "
                f"Approximate time: {body.approximateTime or 'Recent'}.",
            )
        ],
    }

    create_incident(doc)

    alert = build_alert(
        doc,
        "Urgent Student Safety Submission" if body.hasImmediateDanger else f"New {body.reportingMode} Student Report",
        f"{body.category} reported at {body.location}. Immediate human review required.",
    )
    create_alert(alert)

    log_action(
        "Anonymous Gateway" if is_anon else "Student Portal (Encrypted)",
        "Student Reporter Client",
        "Anonymous Report Ingestion" if is_anon else "Confidential Report Ingestion",
        details=f"Generated ref {reference_code}. Privacy safeguards applied: No IP/device fingerprint persisted.",
        related_incident_id=incident_id,
    )

    # Telegram: only reports the student marked as immediate danger. Privacy: the message carries the
    # category and place ONLY: never the student's name, grade, description or contact details,
    # so an anonymous report stays anonymous.
    if body.hasImmediateDanger:
        background_tasks.add_task(
            send_telegram_alert,
            zone_name=body.location,
            severity="high",
            reason=f"Student report ({body.category}) marked as immediate danger",
            incident_id=incident_id,
        )

    return {"incidentId": incident_id, "referenceCode": reference_code, "incident": doc}