"""
Shared helpers for building/mutating the rich Incident JSON document.
Mirrors the frontend's old incidentService.ts logic 1:1 (timeline
entries, audit log entries, id formats) so the backend now does for
real what that file used to fake in localStorage.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.supabase_client import append_audit_log


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_incident_id() -> str:
    year = datetime.now(timezone.utc).year
    return f"SZ-{year}-{random.randint(1000, 9999)}"


def new_alert_id() -> str:
    return f"ALT-{random.randint(1000, 9999)}"


def new_timeline_event(actor: str, role: str, action: str, details: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": f"tl-{uuid.uuid4().hex[:8]}",
        "timestamp": now_iso(),
        "actor": actor,
        "role": role,
        "action": action,
        "details": details,
    }


def new_note(content: str, author: str, role: str) -> dict[str, Any]:
    return {
        "id": f"note-{uuid.uuid4().hex[:8]}",
        "author": author,
        "role": role,
        "timestamp": now_iso(),
        "content": content,
    }


def log_action(
    user: str,
    role: str,
    action: str,
    outcome: str = "Success",
    details: str = "",
    related_incident_id: Optional[str] = None,
) -> None:
    append_audit_log(
        {
            "id": f"aud-{uuid.uuid4().hex[:8]}",
            "timestamp": now_iso(),
            "user": user,
            "role": role,
            "action": action,
            "relatedIncidentId": related_incident_id,
            "outcome": outcome,
            "details": details,
        }
    )


def build_alert(incident: dict[str, Any], title: str, message: str) -> dict[str, Any]:
    return {
        "id": new_alert_id(),
        "incidentId": incident["id"],
        "title": title,
        "message": message,
        "severity": incident["severity"],
        "location": incident["location"],
        "createdAt": now_iso(),
        "acknowledged": False,
        "read": False,
    }


def combine_pipeline_results(baseline_result: dict[str, Any], refined_result: dict[str, Any]) -> dict[str, Any]:
    """Single source of truth for turning two pipeline results into one
    overall verdict + severity. Used by both /api/analyze and
    generate_demo_gallery.py — keep every caller going through this
    instead of re-deriving the logic inline, so the two never drift.

    overall_flagged IS a plain `baseline.flagged or refined.flagged` —
    deliberately safety-conservative. A pipeline catching something the
    other missed should never be silently dropped (missing a real fight
    is worse than a false alarm for a school-safety tool); a human still
    has to review every incident before any action is taken either way.

    An earlier version tried to gate a baseline-only flag behind a
    confidence threshold instead of trusting it outright — that doesn't
    work: baseline's confidence formula saturates to 1.0 the instant any
    single frame's limb speed crosses 3x BASELINE_MOTION_SPIKE, so on
    real demo data it hit exactly 1.0 on every clip it flagged at all
    except one. A number that's (almost) always 1.0 can't discriminate
    "briefly touched the threshold" from "overwhelming signal," so it
    never actually gated anything.

    What DOES need guarding is SEVERITY, not the flag itself. Severity
    only looks at a pipeline's confidence when that pipeline ACTUALLY
    flagged the clip — a pipeline's confidence is a per-frame/moment
    heuristic score that can spike even when the clip overall wasn't
    flagged (e.g. baseline sees one fast limb movement for an instant,
    hits confidence 1.0, but never crosses the flag-ratio threshold so
    flagged stays False) — taking max(confidence) across both pipelines
    regardless of whether they flagged was a real bug: it showed "High
    Priority" on clips the system had just correctly marked clear.

    On top of that: when baseline flags a clip but refined (the pipeline
    we trust more) disagrees and calls it clear, baseline's saturating
    confidence alone can't be trusted to justify "High Priority" — the
    clip still gets created so a human can look (never hidden), but
    severity is capped at medium. Real example this fixes: a staircase
    clip where baseline hit 44% of frames flagged (confidence maxed at
    1.0, matching natural fast ankle motion from walking up/down stairs)
    while refined correctly saw nothing — that used to show as a
    High-Priority incident for a clip with no actual violence in it.
    """
    baseline_flagged = bool(baseline_result["flagged"])
    refined_flagged = bool(refined_result["flagged"])

    overall_flagged = baseline_flagged or refined_flagged

    flagged_confidences = [
        r["confidence"] for r in (baseline_result, refined_result) if r["flagged"]
    ]
    top_confidence = max(flagged_confidences) if flagged_confidences else 0.0
    if top_confidence >= 0.75:
        severity = "high"
    elif top_confidence >= 0.4:
        severity = "medium"
    else:
        severity = "low"

    # Pipelines disagree (baseline alone is the one flagging this) —
    # don't let baseline's unreliable confidence alone claim High.
    if baseline_flagged and not refined_flagged and severity == "high":
        severity = "medium"

    return {"overall_flagged": overall_flagged, "severity": severity}