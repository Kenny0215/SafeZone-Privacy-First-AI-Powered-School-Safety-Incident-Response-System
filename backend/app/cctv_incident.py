"""
Turns two pipeline results (baseline + refined) into a real incident: saves the case, the alert and the
audit-log entry, cuts the evidence image, and sends the Telegram alert for HIGH cases.

Shared by:
  * POST /api/analyze                        (a clip uploaded live)
  * POST /api/demo-clips/{id}/incident       (a gallery camera feed: "Create incident" button)
so both paths build exactly the same incident.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import BackgroundTasks

from app.config import settings
from app.evidence import pick_flagged_frame, save_evidence_frame
from app.incident_logic import (
    build_alert,
    combine_pipeline_results,
    log_action,
    new_incident_id,
    new_timeline_event,
    now_iso,
)
from app.notifications import send_telegram_alert
from app.supabase_client import create_alert, create_incident, get_zones

PRIVATE = "Strictly Private (No Video)"


def _save_evidence(incident_id: str, refined_result: dict, fallback_video: Path | None,
                   zone_name: str, confidence_pct: int) -> str | None:
    """Cut the evidence still for an incident and return its URL, or None if it could not be made.

    Source: the annotated output video (boxes drawn on the people the model flagged), else fallback_video.
    Frame, in order of preference:
      1. the frame where MoViNet scored highest (refined_result["detected_behaviors"], "frame" is 1-based)
      2. the frame with the most red boxes in the annotated video
      3. the middle of the clip
    A failure here must never stop the incident from being saved, so every error is swallowed."""
    try:
        annotated = Path(settings.static_output_dir) / Path(str(refined_result.get("video_url") or "")).name
        source = annotated if annotated.is_file() else fallback_video
        if source is None or not Path(source).is_file():
            print(f"[evidence] FAILED: no video file found for {incident_id}")
            return None

        frame_index, caption = None, f"{zone_name} | AI confidence {confidence_pct}%"
        behaviors = refined_result.get("detected_behaviors") or []
        if behaviors:
            best = max(behaviors, key=lambda b: b.get("score", 0))
            frame_index = max(0, int(best["frame"]) - 1)
            label = best.get("label")
            caption = f"{zone_name} | {label + ' | ' if label else ''}AI confidence {confidence_pct}%"
        else:
            frame_index = pick_flagged_frame(source)

        name = f"evidence_{incident_id}.jpg"
        save_evidence_frame(source, Path(settings.static_output_dir) / name,
                            frame_index=frame_index, caption=caption)
        print(f"[evidence] saved {name} (frame {frame_index}, source {Path(source).name})")
        return f"/static/outputs/{name}"
    except Exception as exc:  # noqa: BLE001
        print(f"[evidence] FAILED to cut the frame for {incident_id}: {type(exc).__name__}: {exc}")
        return None


def create_cctv_incident(
    *,
    baseline_result: dict,
    refined_result: dict,
    camera_location: str,
    is_private_zone: bool,
    background_tasks: BackgroundTasks,
    fallback_video: Path | None = None,
    origin: str = "uploaded clip",
) -> dict:
    """Create the incident. Returns {"incident_id", "overall_flagged", "severity", "snapshot_url"}."""
    combined = combine_pipeline_results(baseline_result, refined_result)
    overall_flagged = combined["overall_flagged"]
    severity = combined["severity"]
    severity_title = severity.capitalize()

    # Resolve the zone by name so the incident links into the real zones table.
    zones = get_zones()
    matching_zone = next((z for z in zones if z["name"].lower() == camera_location.lower()), None)
    privacy_level = PRIVATE if is_private_zone else "Permitted Surveillance"
    if matching_zone:
        privacy_level = matching_zone["privacyLevel"]

    now = now_iso()
    incident_id = new_incident_id()
    confidence_pct = round(max(baseline_result["confidence"], refined_result["confidence"]) * 100)

    # Evidence still: only for flagged clips, and never for a private zone.
    snapshot_url = None
    if not overall_flagged:
        print(f"[evidence] skipped: clip not flagged as violent (baseline={baseline_result['flagged']}, "
              f"refined={refined_result['flagged']}, confidence={confidence_pct}%)")
    elif privacy_level == PRIVATE:
        print("[evidence] skipped: private zone, no video evidence allowed")
    else:
        snapshot_url = _save_evidence(incident_id, refined_result, fallback_video, camera_location, confidence_pct)

    doc = {
        "id": incident_id,
        "category": "Physical Fighting",
        "severity": severity_title,
        "status": "New",
        "location": camera_location,
        "zoneId": matching_zone["id"] if matching_zone else None,
        "privacyLevel": privacy_level,
        "source": "CCTV AI Detection (Permitted Zone)",
        "title": "Possible Physical Altercation Detected" if overall_flagged else "Reviewed Clip — No Violence Flagged",
        "description": (
            f"Baseline (YOLO+ByteTrack): {baseline_result['notes']}\n\n"
            f"Refined (YOLO+MoViNet): {refined_result['notes']}"
        ),
        "reportedAt": now,
        "updatedAt": now,
        "aiAssessment": {
            "isSimulated": False,
            "confidenceScore": confidence_pct,
            "detectedSignals": [
                f"Baseline pipeline: {'FLAGGED' if baseline_result['flagged'] else 'clear'} "
                f"(confidence {round(baseline_result['confidence'] * 100)}%)",
                f"Refined pipeline: {'FLAGGED' if refined_result['flagged'] else 'clear'} "
                f"(confidence {round(refined_result['confidence'] * 100)}%)",
            ],
            "suggestedSeverity": severity_title,
            "rationale": "Generated by SafeZone Video Analysis Engine (real YOLO+ByteTrack baseline vs YOLO+MoViNet refined comparison). Human operator review required before action.",
            "triageTimestamp": now,
        },
        "evidenceSummary": {
            "hasMedia": True,
            "mediaType": "video",
            "isRestricted": False,
            "mediaUrl": refined_result["video_url"],
            "snapshotUrl": snapshot_url,
        },
        "notes": [],
        "timeline": [
            new_timeline_event(
                "SafeZone Vision Engine",
                "Automated AI Detection",
                "Incident Created from Video Analysis",
                f"Source: Optical CCTV in permitted zone ({camera_location}). Confidence: {confidence_pct}%.",
            )
        ],
    }

    create_incident(doc)

    alert = build_alert(
        doc,
        f"AI Vision Alert: {doc['category']}",
        f"Detection at {camera_location} logged as incident {incident_id}.",
    )
    create_alert(alert)

    log_action(
        "SafeZone Vision Engine",
        "Automated AI Detection",
        "Incident Created from Video Analysis Result",
        details=f"Pipeline result from {origin} in zone {camera_location}.",
        related_incident_id=incident_id,
    )

    # Telegram: only for HIGH incidents the AI actually flagged, so the staff group is not flooded.
    # Runs after the response is sent, so a slow or failed Telegram never delays or breaks the request.
    if overall_flagged and severity == "high":
        background_tasks.add_task(
            send_telegram_alert,
            zone_name=camera_location,
            severity=severity,
            reason=f"Possible physical altercation detected by AI ({confidence_pct}% confidence)",
            incident_id=incident_id,
        )

    return {
        "incident_id": incident_id,
        "overall_flagged": overall_flagged,
        "severity": severity,
        "snapshot_url": snapshot_url,
    }