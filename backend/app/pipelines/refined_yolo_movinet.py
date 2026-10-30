
from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

from app.config import settings
from app.pipelines.baseline_yolo_bytetrack import _box_distance
from app.pipelines.video_utils import reencode_to_h264_inplace

CLIP_LEN = 16          # frames per crop sequence fed to MoViNet
CROP_SIZE = 172        # MoViNet-A0 expected input resolution
MIN_BOX_PAD = 20        # px padding around a person's box when cropping

_yolo_model: YOLO | None = None
_movinet_model = None
_movinet_labels: list[str] | None = None
_movinet_load_error: str | None = None
_movinet_labels_missing: bool = False

# Official Kinetics-600 label list used by Google's own MoViNet/TF-Hub
# tutorial (https://www.tensorflow.org/hub/tutorials/movinet), pinned to
# a specific commit so this URL doesn't move under us. Without this file,
# MoViNet's raw logits can't be mapped to label names like "punching" at
# all, and _violence_score() silently degrades to the crude motion-energy
# proxy below EVEN THOUGH the real model loaded fine — a failure mode
# that produces no error, just quietly worse results, so we auto-fetch
# the file the first time it's missing instead of requiring a manual step.
KINETICS_LABELS_URL = (
    "https://raw.githubusercontent.com/tensorflow/models/"
    "f8af2291cced43fc9f1d9b41ddbf772ae7b0d7d2/official/projects/movinet/files/kinetics_600_labels.txt"
)


def _ensure_labels_file(labels_path: Path) -> None:
    if labels_path.exists():
        return
    import urllib.request

    print(f"[refined_yolo_movinet] {labels_path} not found — downloading the official "
          f"Kinetics-600 label list from {KINETICS_LABELS_URL} ...")
    try:
        labels_path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(KINETICS_LABELS_URL, labels_path)
        print(f"[refined_yolo_movinet] saved label list to {labels_path}")
    except Exception as exc:  # noqa: BLE001 - network may be blocked here too
        print(f"[refined_yolo_movinet] could not download the label list ({exc}). "
              f"Violence scoring will fall back to the motion-energy proxy until this "
              f"file exists at {labels_path} — download it yourself from "
              f"{KINETICS_LABELS_URL} and place it there if auto-download keeps failing.")

# Kinetics-600 label substrings treated as "violence-related".
# (Checked against the official label list at load time; see
# _violence_label_indices() below.)
VIOLENCE_LABEL_HINTS = [
    "punching", "slapping", "wrestling", "headbutting", "fighting",
    "kicking", "boxing", "hitting", "strangling", "choking",
]


def _get_yolo() -> YOLO:
    global _yolo_model
    if _yolo_model is None:
        _yolo_model = YOLO(settings.yolo_model_path)
    return _yolo_model


def _load_movinet():
    """
    Loads the pretrained MoViNet-A0 (Kinetics-600) classifier from
    TensorFlow Hub, caching it under MOVINET_MODEL_DIR. Returns
    (model, labels) or (None, None) if the download/load fails (e.g.
    no network access) — callers must handle that gracefully so a
    demo never crashes just because MoViNet couldn't be fetched.
    """
    global _movinet_model, _movinet_labels, _movinet_load_error, _movinet_labels_missing
    if _movinet_model is not None or _movinet_load_error is not None:
        return _movinet_model, _movinet_labels

    try:
        import tensorflow as tf
        import tensorflow_hub as hub

        # Pretrained MoViNet-A0-base, Kinetics-600, classification head.
        hub_url = "https://tfhub.dev/tensorflow/movinet/a0/base/kinetics-600/classification/3"
        model = hub.load(hub_url)
        _movinet_model = model

        labels_path = Path(settings.movinet_model_dir) / "kinetics_600_labels.txt"
        _ensure_labels_file(labels_path)
        if labels_path.exists():
            _movinet_labels = labels_path.read_text().splitlines()
            v_idxs_found = _violence_label_indices(_movinet_labels)
            print(f"[refined_yolo_movinet] loaded {len(_movinet_labels)} labels, "
                  f"{len(v_idxs_found)} matched as violence-related: "
                  f"{[_movinet_labels[i] for i in v_idxs_found]}")
        else:
            # Still missing (download failed, e.g. no network access to
            # GitHub either) — violence scoring degrades to a flat
            # motion-energy proxy (see _violence_score()).
            _movinet_labels = []
            _movinet_labels_missing = True
        return _movinet_model, _movinet_labels

    except Exception as exc:  # noqa: BLE001 - deliberately broad for demo robustness
        _movinet_load_error = str(exc)
        print(f"[refined_yolo_movinet] MoViNet unavailable, falling back to motion-energy proxy: {exc}")
        return None, None


def _violence_label_indices(labels: list[str]) -> list[int]:
    idxs = []
    for i, label in enumerate(labels):
        low = label.lower()
        if any(hint in low for hint in VIOLENCE_LABEL_HINTS):
            idxs.append(i)
    return idxs


def _preprocess_clip(frames: list[np.ndarray]) -> "np.ndarray":
    """frames: list of HxWx3 BGR uint8 crops -> normalized RGB float32 batch."""
    import tensorflow as tf

    clip = np.stack(frames, axis=0)  # [T, H, W, 3] BGR
    clip = clip[..., ::-1]  # BGR -> RGB
    clip = tf.image.resize(clip, (CROP_SIZE, CROP_SIZE)).numpy()
    clip = clip.astype(np.float32) / 255.0
    return clip[np.newaxis, ...]  # [1, T, H, W, 3]


def _motion_energy_score(frames: list[np.ndarray]) -> float:
    """Fallback violence proxy used only if MoViNet/TF-Hub can't be loaded:
    normalized mean absolute frame-to-frame pixel difference. Crude but
    keeps the demo alive end-to-end if the environment has no network
    access to download the Kinetics checkpoint."""
    if len(frames) < 2:
        return 0.0
    diffs = []
    for i in range(1, len(frames)):
        a = cv2.cvtColor(frames[i - 1], cv2.COLOR_BGR2GRAY).astype(np.float32)
        b = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY).astype(np.float32)
        diffs.append(np.mean(np.abs(a - b)))
    return float(min(1.0, np.mean(diffs) / 40.0))


def _movinet_probs(frames: list[np.ndarray]) -> "np.ndarray | None":
    """Runs the frozen MoViNet backbone and returns its full 600-way
    softmax probability vector for this clip of frames, or None if the
    model/inference isn't available (caller falls back to the
    motion-energy proxy in that case).

    Split out of _violence_score() so finetune_movinet_head.py can reuse
    the exact same backbone call to build training features — it trains
    a small classifier on top of this FULL 600-dim vector instead of
    only the ~15 hand-picked violence-related labels, so it isn't
    limited to labels we guessed were relevant.
    """
    model, _labels = _load_movinet()
    if model is None:
        return None
    try:
        clip = _preprocess_clip(frames)
        logits = model.signatures["serving_default"](image=clip)
        # Output key name can vary by MoViNet hub version; handle both.
        probs = None
        for key in ("classifier_head", "logits", "default"):
            if key in logits:
                probs = logits[key].numpy()[0]
                break
        if probs is None:
            probs = list(logits.values())[0].numpy()[0]

        probs = probs - probs.max()
        return np.exp(probs) / np.exp(probs).sum()  # softmax
    except Exception as exc:  # noqa: BLE001
        print(f"[refined_yolo_movinet] inference error: {exc}")
        return None


# --- optional fine-tuned head ---
# finetune_movinet_head.py trains a small logistic-regression classifier
# on top of the frozen backbone's full 600-dim output, using your real
# RWF-2000 train split, and saves it here. If present, it REPLACES the
# hand-picked-label-sum heuristic below with a learned decision boundary
# over all 600 classes (not just the ~15 we guessed were violence-
# related). If absent (you haven't run that script, or chose not to),
# behavior is unchanged from before — this is purely additive.
_finetuned_head: tuple["np.ndarray", float] | None = None
_finetuned_head_checked = False
FINETUNED_HEAD_PATH = Path(settings.movinet_model_dir) / "violence_head.json"


def _load_finetuned_head() -> "tuple[np.ndarray, float] | None":
    global _finetuned_head, _finetuned_head_checked
    if _finetuned_head_checked:
        return _finetuned_head
    _finetuned_head_checked = True
    if FINETUNED_HEAD_PATH.exists():
        import json
        data = json.loads(FINETUNED_HEAD_PATH.read_text())
        _finetuned_head = (np.array(data["coef"]), float(data["intercept"]))
        print(f"[refined_yolo_movinet] loaded fine-tuned violence head from {FINETUNED_HEAD_PATH} "
              f"(trained on {data.get('trained_on_clips', '?')} clips, "
              f"held-out accuracy {data.get('held_out_accuracy', 0):.1%})")
    return _finetuned_head


def _violence_score(frames: list[np.ndarray]) -> float:
    """Plain-float convenience wrapper around _score_and_top_label(), for
    any caller that only wants the number."""
    score, _label, _label_conf = _score_and_top_label(frames)
    return score


def _score_and_top_label(frames: list[np.ndarray]) -> tuple[float, str | None, float | None]:
    """
    Same scoring logic as the old _violence_score() (finetuned head if
    one's been trained, else the hand-picked-label-sum heuristic over
    the ~15 violence-related Kinetics-600 labels, else the
    motion-energy fallback) — but ALSO returns which single label (of
    those ~15, e.g. "punching person (boxing)", "wrestling",
    "slapping") had the highest raw softmax probability for this clip.
    That's what lets a flagged window be shown as a specific recognized
    behavior instead of just a bare number.

    Returns (score, top_label, top_label_confidence). The label fields
    are None when there's no label list to consult (motion-energy
    fallback has no labels at all) or none of the ~15 violence labels
    scored above zero. Note this label is a best-effort "closest match"
    explanation, not necessarily the literal cause of the score — if
    the fine-tuned head is active, its decision boundary runs over all
    600 Kinetics classes, not just these 15, so it can flag a clip
    these 15 barely registered on.
    """
    probs = _movinet_probs(frames)
    if probs is None:
        return _motion_energy_score(frames), None, None

    _, labels = _load_movinet()
    top_label: str | None = None
    top_label_conf: float | None = None
    v_idxs: list[int] = []
    if labels:
        v_idxs = _violence_label_indices(labels)
        if v_idxs:
            best_idx = max(v_idxs, key=lambda i: probs[i])
            if probs[best_idx] > 0:
                top_label = labels[best_idx]
                top_label_conf = float(probs[best_idx])

    head = _load_finetuned_head()
    if head is not None:
        coef, intercept = head
        z = float(np.dot(probs, coef) + intercept)
        score = float(1.0 / (1.0 + np.exp(-z)))  # sigmoid -> calibrated P(violence)
    elif v_idxs:
        score = float(min(1.0, probs[v_idxs].sum()))
    else:
        score = _motion_energy_score(frames)

    return score, top_label, top_label_conf


def run_refined(
    input_video_path: str,
    job_id: str | None = None,
    return_raw: bool = False,
) -> dict[str, Any]:
    """
    Runs YOLO+ByteTrack for spatial localization, buffers CLIP_LEN-frame
    crops per track ID, scores each buffered clip with MoViNet, and
    writes an annotated output video with red/green boxes.

    The result's "detected_behaviors" (always included, not gated
    behind return_raw) lists every scoring event that got flagged, with
    WHICH Kinetics-600 violence-related label (of the ~15 matched at
    startup, e.g. "punching person (boxing)", "wrestling", "slapping")
    best matched that window: [{"frame", "track_id", "label",
    "label_confidence", "score"}, ...]. This is what lets the frontend
    show a specific recognized behavior per flagged moment instead of
    just a bare confidence number.

    If return_raw=True, the result also includes "raw_scores": every
    individual MoViNet score computed during the clip, as
    [{"frame", "track_id", "score"}, ...]. That's everything
    calibrate_thresholds.py needs to find a better
    movinet_violence_threshold WITHOUT re-running MoViNet for every
    candidate value. No-op for the normal /api/analyze path.
    """
    job_id = job_id or uuid.uuid4().hex[:8]
    model = _get_yolo()

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {input_video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    output_filename = f"refined_{job_id}.mp4"
    output_path = str(Path(settings.static_output_dir) / output_filename)
    output_url = f"/static/outputs/{output_filename}"
    writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

    # per track id: rolling buffer of cropped frames + latest verdict
    crop_buffers: dict[int, deque] = defaultdict(lambda: deque(maxlen=CLIP_LEN))
    # id -> (flagged, score, top_label). top_label is None until a flagged
    # score actually found one (or if there's none to find — see
    # _score_and_top_label's docstring).
    latest_verdict: dict[int, tuple[bool, float, str | None]] = {}

    total_frames = 0
    flagged_frames = 0
    max_score = 0.0
    start_time = time.time()
    # Tracks the frame index each track id was LAST scored at, so we only
    # run MoViNet once per CLIP_LEN *new* frames per person, not every
    # single frame once the rolling buffer first fills up.
    last_scored_at: dict[int, int] = {}
    raw_scores: list[dict[str, Any]] | None = [] if return_raw else None
    # Every scoring event that got flagged, with which specific
    # violence-related label best matched it — see run_refined's
    # docstring. Always collected (not gated behind return_raw).
    detected_behaviors: list[dict[str, Any]] = []

    results_stream = model.track(
        source=input_video_path,
        persist=True,
        # Same tuned ByteTrack config as the baseline pipeline (see
        # app/pipelines/bytetrack_tuned.yaml) — refined depends on the
        # exact same continuous per-track frame buffering (CLIP_LEN
        # frames per score), so the stock tracker's track-dropping
        # problem starves MoViNet's scoring here just as much as it
        # distorted baseline's motion heuristic.
        tracker=settings.baseline_tracker_config,
        conf=settings.yolo_conf_threshold,
        stream=True,
        verbose=False,
    )

    for result in results_stream:
        # IMPORTANT: `frame` stays the raw, unannotated image — it's what
        # gets cropped and fed to MoViNet, so it must never have skeleton
        # lines or boxes drawn on it. `annotated` is a separate canvas,
        # built from ultralytics' own pose plotting (visual proof this
        # pipeline is also running on the same pose model as baseline),
        # used only for the output video that gets written to disk.
        frame = result.orig_img.copy()
        h, w = frame.shape[:2]
        try:
            annotated = result.plot(boxes=False, labels=False, conf=False, kpt_radius=4)
        except Exception as exc:  # noqa: BLE001 - never let a plotting quirk crash the pipeline
            print(f"[refined] skeleton plot failed ({exc}), falling back to plain frame")
            annotated = frame.copy()
        total_frames += 1
        if total_frames % 30 == 0:
            print(f"[refined] processed {total_frames} frames "
                  f"({time.time() - start_time:.1f}s elapsed, "
                  f"{len(crop_buffers)} tracked people buffered)")

        boxes = result.boxes
        if boxes is None or boxes.id is None:
            writer.write(annotated)
            continue

        ids = boxes.id.cpu().numpy().astype(int)
        xyxy = boxes.xyxy.cpu().numpy()

        # Widen each track's crop region to include any nearby person's
        # box too (same "close contact" cutoff the baseline heuristic
        # uses) — see the module docstring for why. own_boxes keyed by
        # track id so the union check below is a simple lookup.
        own_boxes = {int(tid): xyxy[i] for i, tid in enumerate(ids)}
        crop_regions: dict[int, np.ndarray] = {}
        for tid, own_box in own_boxes.items():
            region = own_box.copy()
            for other_tid, other_box in own_boxes.items():
                if other_tid == tid:
                    continue
                if _box_distance(own_box, other_box) <= settings.baseline_proximity_px:
                    region[0] = min(region[0], other_box[0])
                    region[1] = min(region[1], other_box[1])
                    region[2] = max(region[2], other_box[2])
                    region[3] = max(region[3], other_box[3])
            crop_regions[tid] = region

        frame_flag = False
        for i, track_id in enumerate(ids):
            tid = int(track_id)
            # Drawing still uses each person's OWN box (own_boxes[tid],
            # unpadded) further below — crop_regions[tid] (possibly
            # widened to include a nearby person, and padded) is only
            # for what gets fed to MoViNet.
            x1, y1, x2, y2 = crop_regions[tid].astype(int)
            x1, y1 = max(0, x1 - MIN_BOX_PAD), max(0, y1 - MIN_BOX_PAD)
            x2, y2 = min(w, x2 + MIN_BOX_PAD), min(h, y2 + MIN_BOX_PAD)
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            # Resize every crop to a fixed size BEFORE buffering. A person's
            # box changes size frame to frame, so without this the buffered
            # crops have different shapes and np.stack() in _preprocess_clip
            # (and the pixel-diff in _motion_energy_score) blow up with
            # "all input arrays must have the same shape".
            crop = cv2.resize(crop, (CROP_SIZE, CROP_SIZE))

            crop_buffers[track_id].append(crop)

            # Score this person once their buffer is full AND it's been at
            # least CLIP_LEN new frames since we last scored them — NOT on
            # every frame once the buffer first fills (that was the bug
            # causing a MoViNet call almost every frame per person).
            frames_since_last_score = total_frames - last_scored_at.get(track_id, -CLIP_LEN)
            if len(crop_buffers[track_id]) == CLIP_LEN and frames_since_last_score >= CLIP_LEN:
                print(f"[refined] scoring track {track_id} at frame {total_frames}...")
                score, top_label, top_label_conf = _score_and_top_label(list(crop_buffers[track_id]))
                label_note = f" top_label={top_label!r} ({top_label_conf:.2f})" if top_label else ""
                print(f"[refined] track {track_id} score={score:.3f}{label_note}")
                flagged = score >= settings.movinet_violence_threshold
                latest_verdict[track_id] = (flagged, score, top_label if flagged else None)
                max_score = max(max_score, score)
                last_scored_at[track_id] = total_frames
                if flagged and top_label is not None:
                    detected_behaviors.append(
                        {
                            "frame": total_frames,
                            "track_id": int(track_id),
                            "label": top_label,
                            "label_confidence": round(top_label_conf, 3),
                            "score": round(score, 3),
                        }
                    )
                if return_raw:
                    raw_scores.append({"frame": total_frames, "track_id": int(track_id), "score": score})

            flagged, score, top_label = latest_verdict.get(track_id, (False, 0.0, None))
            if flagged:
                frame_flag = True
            color = (0, 0, 255) if flagged else (0, 200, 0)
            # Drawn box is this person's OWN box (own_boxes[tid]), not the
            # widened crop_regions[tid] used above for MoViNet's input —
            # otherwise two nearby people would show the same oversized box.
            own_x1, own_y1, own_x2, own_y2 = own_boxes[tid].astype(int)
            cv2.rectangle(annotated, (own_x1, own_y1), (own_x2, own_y2), color, 2)
            # Show the actual recognized behavior (e.g. "punching person
            # (boxing)") on-screen when there is one, not just a bare
            # "VIOLENCE" tag — this is the human-visible version of
            # detected_behaviors below.
            box_label = f"ID {track_id} {score:.2f}"
            if flagged:
                box_label += f" VIOLENCE: {top_label}" if top_label else " VIOLENCE"
            cv2.putText(annotated, box_label, (own_x1, max(0, own_y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

        if frame_flag:
            flagged_frames += 1

        writer.write(annotated)

    writer.release()
    reencode_to_h264_inplace(output_path)  # make it playable in a browser
    elapsed = time.time() - start_time
    effective_fps = round(total_frames / elapsed, 1) if elapsed > 0 else 0.0
    print(f"[refined] DONE: {total_frames} frames in {elapsed:.1f}s ({effective_fps} fps)")
    flagged_ratio = (flagged_frames / total_frames) if total_frames else 0.0
    overall_flag = flagged_ratio > settings.refined_flag_ratio_threshold

    degraded_note = (
        " (MoViNet unreachable this run — scored with motion-energy fallback; "
        "re-run with network/model access for the real classifier.)"
        if _movinet_load_error
        else " (Kinetics-600 label list unavailable — scored with motion-energy "
             "fallback, not real MoViNet violence classification.)"
        if _movinet_labels_missing
        else ""
    )

    result: dict[str, Any] = {
        "pipeline": "refined_yolo_movinet",
        "flagged": overall_flag,
        "confidence": round(max_score, 3),
        "video_url": output_url,
        "fps": effective_fps,
        "notes": (
            f"{flagged_frames}/{total_frames} frames ({flagged_ratio:.1%}) had at least one "
            f"track classified as violent by MoViNet." + degraded_note
        ),
        "detected_behaviors": detected_behaviors,
    }
    if return_raw:
        result["raw_scores"] = raw_scores
        result["movinet_degraded"] = bool(_movinet_load_error) or _movinet_labels_missing
    return result