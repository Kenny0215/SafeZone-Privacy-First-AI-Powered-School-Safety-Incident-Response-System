"""
Pydantic request/response models — this is the exact contract your
React (Google AI Studio) frontend should call. Keep this file as the
single source of truth when wiring up fetch()/axios calls.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------
# /api/analyze
# ---------------------------------------------------------------
class DetectedBehavior(BaseModel):
    frame: int
    track_id: int
    label: str
    label_confidence: float
    score: float


class PipelineResult(BaseModel):
    pipeline: str
    flagged: bool
    confidence: float
    video_url: str
    fps: float
    notes: str
    # Only populated by the refined (MoViNet) pipeline — which specific
    # Kinetics-600 violence-related label (of the ~15 matched at
    # startup, e.g. "punching person (boxing)", "wrestling") best
    # matched each flagged frame/track. Empty for the baseline pipeline,
    # which has no such labels to report.
    detected_behaviors: list[DetectedBehavior] = []


class AnalyzeResponse(BaseModel):
    incident_id: str
    camera_location: Optional[str] = None
    is_private_zone: bool
    baseline: PipelineResult
    refined: PipelineResult
    # convenience top-level verdict used by the dashboard card
    overall_flagged: bool
    severity: str


# ---------------------------------------------------------------
# /api/incidents, /api/zones, /api/alerts, /api/student-reports
#
# These endpoints intentionally return raw dicts rather than strict
# Pydantic response models: each incident/zone/alert row's `doc`/
# column set already matches the frontend's TS types (Incident,
# SchoolZone, AlertNotification) field-for-field in camelCase, built
# directly in app/incident_logic.py and the routers themselves, so
# there is no separate schema to keep in sync here. Request bodies
# for the mutating endpoints are still typed Pydantic models, defined
# inline in app/routers/incidents.py, alerts.py and student_reports.py.
# ---------------------------------------------------------------


# ---------------------------------------------------------------
# /api/sos
# ---------------------------------------------------------------
class SosCreateRequest(BaseModel):
    camera_location: str
    triggered_by: Optional[str] = None
    message: Optional[str] = None
    linked_incident_id: Optional[str] = None


class SosOut(BaseModel):
    id: str
    created_at: str
    camera_location: str
    triggered_by: Optional[str] = None
    message: Optional[str] = None
    status: str
    linked_incident_id: Optional[str] = None


class SosUpdateRequest(BaseModel):
    status: str = Field(..., description="open | acknowledged | resolved")
    acknowledged_by: Optional[str] = None