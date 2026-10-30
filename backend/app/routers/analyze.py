"""
POST /api/analyze
Upload a video clip; the backend runs BOTH pipelines (baseline YOLO+
ByteTrack, and refined YOLO+MoViNet) on it, creates a real incident
case (same rich shape the rest of the app uses — Incident Management,
Safety Map, Alerts all see it immediately) in Supabase, and returns
the comparison so the frontend can render it side by side for the demo.

The incident itself (case, alert, audit log, evidence image, Telegram) is built by
app/cctv_incident.py, shared with the gallery "Create incident" button.

This is synchronous/blocking by design for the demo: simplest to wire
up and to reason about on stage. If a clip is long, this call can take
a while — the frontend should show a loading state.
"""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.cctv_incident import create_cctv_incident
from app.config import settings
from app.models.schemas import AnalyzeResponse, PipelineResult
from app.pipelines.baseline_yolo_bytetrack import run_baseline
from app.pipelines.refined_yolo_movinet import run_refined

router = APIRouter(prefix="/api", tags=["analyze"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    camera_location: str = Form("Unspecified"),
    is_private_zone: bool = Form(False),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Use one of {sorted(ALLOWED_EXTENSIONS)}.")

    job_id = uuid.uuid4().hex[:10]
    upload_path = Path(settings.static_upload_dir) / f"{job_id}{ext}"
    with upload_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        baseline_result = run_baseline(str(upload_path), job_id=job_id)
        refined_result = run_refined(str(upload_path), job_id=job_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Pipeline error: {exc}") from exc

    created = create_cctv_incident(
        baseline_result=baseline_result,
        refined_result=refined_result,
        camera_location=camera_location,
        is_private_zone=is_private_zone,
        background_tasks=background_tasks,
        fallback_video=upload_path,
        origin="uploaded clip",
    )

    return AnalyzeResponse(
        incident_id=created["incident_id"],
        camera_location=camera_location,
        is_private_zone=is_private_zone,
        baseline=PipelineResult(**baseline_result),
        refined=PipelineResult(**refined_result),
        overall_flagged=created["overall_flagged"],
        severity=created["severity"],
    )