
from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

from app.config import settings
from app.pipelines.video_utils import reencode_to_h264_inplace

# Keypoint indices for COCO pose (what yolov8/11-pose.pt outputs)
WRIST_L, WRIST_R = 9, 10
ANKLE_L, ANKLE_R = 15, 16
LIMB_KEYPOINTS = [WRIST_L, WRIST_R, ANKLE_L, ANKLE_R]

_model: YOLO | None = None


def _get_model() -> YOLO:
    global _model
    if _model is None:
        _model = YOLO(settings.yolo_model_path)  # auto-downloads on first run
    return _model


def _box_distance(box_a: np.ndarray, box_b: np.ndarray) -> float:
    """Shortest distance between two [x1,y1,x2,y2] boxes (0 if overlapping)."""
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    dx = max(bx1 - ax2, ax1 - bx2, 0)
    dy = max(by1 - ay2, ay1 - by2, 0)
    return float(np.hypot(dx, dy))


def run_baseline(
    input_video_path: str,
    job_id: str | None = None,
    return_raw: bool = False,
) -> dict[str, Any]:
    """
    Runs YOLO-pose + ByteTrack over the input video and writes an annotated
    output video. Returns a summary dict to store in Supabase.

    If return_raw=True, the result also includes "raw_frames": a per-frame
    list of {"pairs": [{"a", "b", "dist"}, ...], "speeds": {track_id: speed}}
    — everything needed to recompute the flagged/confidence decision for
    ANY baseline_proximity_px / baseline_motion_spike / flag-ratio
    threshold values WITHOUT re-running YOLO. This is what
    calibrate_thresholds.py uses to sweep thresholds cheaply. It's a
    no-op for the normal /api/analyze path (adds a bit of memory, no
    behavior change to flagged/confidence).
    """
    job_id = job_id or uuid.uuid4().hex[:8]
    model = _get_model()

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {input_video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    output_filename = f"baseline_{job_id}.mp4"
    output_path = str(Path(settings.static_output_dir) / output_filename)
    output_url = f"/static/outputs/{output_filename}"
    writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

    # track_id -> (previous frame's keypoint xy, previous frame's
    # per-keypoint confidence) for the motion-spike calc.
    prev_keypoints: dict[int, tuple[np.ndarray, np.ndarray | None]] = {}

    flagged_frames = 0
    total_frames = 0
    max_flag_score = 0.0
    start_time = time.time()
    raw_frames: list[dict[str, Any]] | None = [] if return_raw else None

    results_stream = model.track(
        source=input_video_path,
        persist=True,
        tracker=settings.baseline_tracker_config,
        conf=settings.yolo_conf_threshold,
        stream=True,
        verbose=False,
    )

    for result in results_stream:
        frame = result.orig_img.copy()
        total_frames += 1
        if total_frames % 30 == 0:
            print(f"[baseline] processed {total_frames} frames "
                  f"({time.time() - start_time:.1f}s elapsed)")

        boxes = result.boxes
        keypoints = result.keypoints

        frame_people: list[dict[str, Any]] = []
        if boxes is not None and boxes.id is not None:
            ids = boxes.id.cpu().numpy().astype(int)
            xyxy = boxes.xyxy.cpu().numpy()
            kpts_xy = keypoints.xy.cpu().numpy() if keypoints is not None else None
            # Per-keypoint confidence (same shape as kpts_xy minus the
            # last axis) — NOT the same as the box's own detection
            # confidence. An occluded wrist still gets an xy position
            # (the model's best guess), but with a low conf score; that's
            # exactly the case we want to exclude from the speed calc.
            kpts_conf = (
                keypoints.conf.cpu().numpy()
                if keypoints is not None and keypoints.conf is not None
                else None
            )

            for i, track_id in enumerate(ids):
                frame_people.append(
                    {
                        "id": int(track_id),
                        "box": xyxy[i],
                        "kpts": kpts_xy[i] if kpts_xy is not None else None,
                        "kconf": kpts_conf[i] if kpts_conf is not None else None,
                    }
                )

        # --- per-person limb speed, computed once (not once per pair) ---
        person_speed: dict[int, float] = {}
        for person in frame_people:
            tid = person["id"]
            kpts = person["kpts"]
            kconf = person["kconf"]
            if kpts is None or tid not in prev_keypoints:
                continue
            prev, prev_conf = prev_keypoints[tid]
            speeds = []
            for k in LIMB_KEYPOINTS:
                if k >= len(kpts) or k >= len(prev):
                    continue
                # Skip a limb keypoint if it wasn't confidently observed
                # in EITHER frame. A low-confidence point is the model's
                # guess at an occluded/blurred limb, not a real
                # observation — letting that guess jump around frame to
                # frame is exactly what was producing fake motion-spike
                # triggers on grainy footage, independent of any real
                # punch/kick.
                if kconf is not None and kconf[k] < settings.min_keypoint_confidence:
                    continue
                if prev_conf is not None and prev_conf[k] < settings.min_keypoint_confidence:
                    continue
                speeds.append(float(np.hypot(*(kpts[k] - prev[k]))))
            if speeds:
                person_speed[tid] = max(speeds)

        # --- heuristic: proximity + limb motion spike between any pair ---
        frame_flag = False
        frame_score = 0.0
        flagged_ids: set[int] = set()
        pair_records: list[dict[str, Any]] | None = [] if return_raw else None

        for a in range(len(frame_people)):
            for b in range(a + 1, len(frame_people)):
                pa, pb = frame_people[a], frame_people[b]
                dist = _box_distance(pa["box"], pb["box"])
                if return_raw:
                    pair_records.append({"a": pa["id"], "b": pb["id"], "dist": dist})
                if dist > settings.baseline_proximity_px:
                    continue  # not close enough to be a contact event

                best_speed = max(person_speed.get(pa["id"], 0.0), person_speed.get(pb["id"], 0.0))
                if best_speed > settings.baseline_motion_spike:
                    frame_flag = True
                    flagged_ids.update([pa["id"], pb["id"]])
                    frame_score = max(frame_score, min(1.0, best_speed / (settings.baseline_motion_spike * 3)))

        if frame_flag:
            flagged_frames += 1
            max_flag_score = max(max_flag_score, frame_score)

        if return_raw:
            raw_frames.append({"pairs": pair_records, "speeds": dict(person_speed)})

        # update motion history
        for person in frame_people:
            if person["kpts"] is not None:
                prev_keypoints[person["id"]] = (person["kpts"], person["kconf"])

        # --- draw the actual pose skeleton (ultralytics' own plotting
        # knows how to connect COCO-17 keypoints into a skeleton; this is
        # the visual proof the baseline is really using pose, not just
        # bounding boxes), THEN our own flagged/clear box + label on top ---
        try:
            annotated = result.plot(boxes=False, labels=False, conf=False, kpt_radius=4)
        except Exception as exc:  # noqa: BLE001 - never let a plotting quirk crash the pipeline
            print(f"[baseline] skeleton plot failed ({exc}), falling back to plain frame")
            annotated = frame

        for person in frame_people:
            x1, y1, x2, y2 = person["box"].astype(int)
            is_flagged = person["id"] in flagged_ids
            color = (0, 0, 255) if is_flagged else (0, 200, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"ID {person['id']}" + (" VIOLENCE?" if is_flagged else "")
            cv2.putText(annotated, label, (x1, max(0, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        writer.write(annotated)

    writer.release()
    reencode_to_h264_inplace(output_path)  # make it playable in a browser
    elapsed = time.time() - start_time
    effective_fps = round(total_frames / elapsed, 1) if elapsed > 0 else 0.0
    print(f"[baseline] DONE: {total_frames} frames in {elapsed:.1f}s ({effective_fps} fps)")

    flagged_ratio = (flagged_frames / total_frames) if total_frames else 0.0
    overall_flag = flagged_ratio > settings.baseline_flag_ratio_threshold

    result: dict[str, Any] = {
        "pipeline": "baseline_yolo_bytetrack",
        "flagged": overall_flag,
        "confidence": round(max_flag_score, 3),
        "video_url": output_url,
        "fps": effective_fps,
        "notes": (
            f"{flagged_frames}/{total_frames} frames ({flagged_ratio:.1%}) showed "
            f"close-contact + limb-motion-spike pattern."
        ),
    }
    if return_raw:
        result["raw_frames"] = raw_frames
    return result