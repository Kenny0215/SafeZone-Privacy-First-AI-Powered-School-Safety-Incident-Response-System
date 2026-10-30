"""
POST /api/demo-clips/{clip_id}/incident

The "Create incident" button on a gallery camera feed. The gallery results are precomputed
(generate_demo_gallery.py -> app/static/demo_gallery.json); this turns one flagged feed into a REAL
incident, with its evidence image, alert, audit-log entry and Telegram message, so the rest of the demo
(Incident Management, Safety Map, Alerts) has something real to show.

Only a feed the AI flagged can become an incident.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.cctv_incident import create_cctv_incident

router = APIRouter(prefix="/api", tags=["demo-incidents"])

MANIFEST_PATH = Path("app/static/demo_gallery.json")   # same path generate_demo_gallery.py writes to


@router.post("/demo-clips/{clip_id}/incident")
def create_incident_from_demo_clip(clip_id: str, background_tasks: BackgroundTasks):
    if not MANIFEST_PATH.is_file():
        raise HTTPException(404, "Demo gallery not generated yet. Run generate_demo_gallery.py first.")
    clips = json.loads(MANIFEST_PATH.read_text())
    clip = next((c for c in clips if c.get("id") == clip_id), None)
    if clip is None:
        raise HTTPException(404, f"No demo clip with id '{clip_id}'.")
    if not clip.get("overall_flagged"):
        raise HTTPException(400, "The AI did not flag this feed, so there is nothing to report.")

    created = create_cctv_incident(
        baseline_result=clip["baseline"],
        refined_result=clip["refined"],
        camera_location=clip["zone_name"],
        is_private_zone=False,
        background_tasks=background_tasks,
        origin=f"camera feed {clip.get('source_filename', clip_id)}",
    )
    return {
        "incident_id": created["incident_id"],
        "snapshot_url": created["snapshot_url"],
        "severity": created["severity"],
    }