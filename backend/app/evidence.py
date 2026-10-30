"""
Cut ONE still frame out of a clip to show as evidence on an incident.

Which frame: the moment the model was most sure. If the pipeline gives a timeline of confidences
(one value per sampled frame or window, evenly spread over the clip) the frame at the highest value
is used; otherwise the middle of the clip.

Use the ANNOTATED output video (the one with the boxes drawn) as the source, so the evidence shows
who the model flagged, not just a bare frame.

Privacy: only call this for zones where video is permitted. Never for private zones.

    from app.evidence import save_evidence_frame
    info = save_evidence_frame(video_path, "app/static/evidence/incident_123.jpg",
                               timeline=result.get("timeline"),
                               caption="Courtyard  2026-10-23 13:22  conf 0.91")
    # info = {"path": ..., "frame_index": 41, "time_s": 1.64, "confidence": 0.91}
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def _peak_position(timeline: list[float] | None) -> tuple[float, float | None]:
    """Return (position 0..1 along the clip, confidence at that position)."""
    if timeline and len(timeline) >= 2:
        best = max(range(len(timeline)), key=lambda i: timeline[i])
        return best / (len(timeline) - 1), float(timeline[best])
    return 0.5, None


RED_MIN_PIXELS = 150   # fewer red pixels than this in the best frame = no clear flagged moment


def pick_flagged_frame(video_path: str | Path, step: int = 3) -> int | None:
    """Index of the frame with the most red-box pixels in an ANNOTATED video (the pipelines draw red boxes
    only on people they flagged), or None if no frame looks flagged. Used when the pipeline did not report
    which frame it scored highest on."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    best_idx, best_count, idx = None, 0, 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                b, g, r = frame[..., 0], frame[..., 1], frame[..., 2]
                count = int(np.count_nonzero((r > 200) & (g < 70) & (b < 70)))
                if count > best_count:
                    best_idx, best_count = idx, count
            idx += 1
    finally:
        cap.release()
    return best_idx if best_count >= RED_MIN_PIXELS else None


def _draw_caption(frame, text: str) -> None:
    h, w = frame.shape[:2]
    scale = max(0.5, w / 1280)
    thickness = max(1, int(round(scale * 2)))
    (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
    pad = int(8 * scale)
    cv2.rectangle(frame, (0, h - th - base - 2 * pad), (min(w, tw + 2 * pad), h), (0, 0, 0), -1)
    cv2.putText(frame, text, (pad, h - base - pad), cv2.FONT_HERSHEY_SIMPLEX, scale,
                (255, 255, 255), thickness, cv2.LINE_AA)


def save_evidence_frame(
    video_path: str | Path,
    out_path: str | Path,
    timeline: list[float] | None = None,
    frame_index: int | None = None,
    caption: str | None = None,
    max_width: int = 960,
    jpeg_quality: int = 85,
) -> dict:
    """Save the evidence frame as a JPEG. Raises ValueError if the video cannot be read."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        position, confidence = _peak_position(timeline)
        if frame_index is None:
            frame_index = int(round(position * (total - 1))) if total > 0 else 0

        frame = None
        # Try the wanted frame, then step back a few frames (the last frame of some files fails to decode).
        for candidate in (frame_index, frame_index - 1, frame_index - 2, frame_index - 3, 0):
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, candidate))
            ok, img = cap.read()
            if ok and img is not None:
                frame, frame_index = img, max(0, candidate)
                break
        if frame is None:
            raise ValueError(f"Could not decode any frame from: {video_path}")
    finally:
        cap.release()

    h, w = frame.shape[:2]
    if w > max_width:
        frame = cv2.resize(frame, (max_width, int(h * max_width / w)), interpolation=cv2.INTER_AREA)
    if caption:
        _draw_caption(frame, caption)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(out), frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]):
        raise ValueError(f"Could not write {out}")
    return {
        "path": str(out),
        "frame_index": frame_index,
        "time_s": round(frame_index / fps, 2),
        "confidence": None if confidence is None else round(confidence, 4),
    }