import argparse
import json
import random
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.pipelines.baseline_yolo_bytetrack import run_baseline
from app.pipelines.refined_yolo_movinet import run_refined

RWF_DIR = Path("data/RWF-2000")
OUT_PATH = Path("app/static/model_eval.json")
OUTPUT_DIR = Path(settings.static_output_dir)
VIDEO_EXTS = {".avi", ".mp4"}
LABELS = ("Fight", "NonFight")
TIMELINE_KEYS = ("timeline", "frame_scores", "per_frame_confidence", "window_scores")

def _gallery_stems() -> set[str]:
    """Stems of the hand-picked demo gallery clips, so they are never part of the evaluation."""
    try:
        from generate_demo_gallery import CURATED_CLIPS
        return {c["filename_stem"] for c in CURATED_CLIPS}
    except Exception:
        return set()


def _sample(split: str, per_class: int, seed: int, exclude: set[str]) -> list[tuple[Path, str]]:
    rng = random.Random(seed)
    picked: list[tuple[Path, str]] = []
    for label in LABELS:
        folder = RWF_DIR / split / label
        if not folder.exists():
            raise SystemExit(f"Expected {folder} to exist. Check RWF_DIR and --split.")
        files = sorted(p for p in folder.iterdir()
                       if p.suffix.lower() in VIDEO_EXTS and not any(p.stem.startswith(s) for s in exclude))
        if len(files) < per_class:
            print(f"Only {len(files)} {label} clips available in {folder}; using all of them.")
        picked += [(p, label) for p in rng.sample(files, min(per_class, len(files)))]
    rng.shuffle(picked)
    return picked


def _timeline(result: dict) -> list[float] | None:
    for key in TIMELINE_KEYS:
        values = result.get(key)
        if not isinstance(values, list) or len(values) < 2:
            continue
        out = []
        for v in values:
            if isinstance(v, dict):
                v = v.get("confidence", v.get("score"))
            if not isinstance(v, (int, float)):
                break
            out.append(round(float(v), 4))
        else:
            return out
    return None


def _summarise(result: dict) -> dict:
    """Keep only what the metrics need (no video URLs: those files are deleted below)."""
    summary = {
        "flagged": bool(result["flagged"]),
        "confidence": round(float(result["confidence"]), 4),
        "fps": round(float(result["fps"]), 2),
    }
    timeline = _timeline(result)
    if timeline:
        summary["timeline"] = timeline
    return summary


def _remove_outputs(job_id: str) -> None:
    """The pipelines write annotated videos; evaluation does not need them."""
    if OUTPUT_DIR.exists():
        for f in OUTPUT_DIR.glob(f"*{job_id}*"):
            f.unlink(missing_ok=True)


def _print_summary(clips: list[dict]) -> None:
    n = len(clips)
    if not n:
        return
    print(f"\n=== Results on {n} clips ===")
    for key in ("baseline", "refined"):
        tp = sum(c["ground_truth"] == "Fight" and c[key]["flagged"] for c in clips)
        fn = sum(c["ground_truth"] == "Fight" and not c[key]["flagged"] for c in clips)
        fp = sum(c["ground_truth"] == "NonFight" and c[key]["flagged"] for c in clips)
        tn = n - tp - fn - fp
        fps = sum(c[key]["fps"] for c in clips) / n
        print(f"{key:9s} correct {tp + tn}/{n} | fights caught {tp}/{tp + fn} | "
              f"false alarms {fp}/{fp + tn} | {fps:.1f} fps")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--split", default="train", help="RWF-2000 split folder to sample from (default: train)")
    ap.add_argument("--per-class", type=int, default=20, help="clips per class (default: 20)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    clips_to_run = _sample(args.split, args.per_class, args.seed, _gallery_stems())
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    failed: list[dict] = []
    started = time.time()

    for i, (path, label) in enumerate(clips_to_run, 1):
        job_id = f"eval_{uuid.uuid4().hex[:8]}"
        print(f"[{i}/{len(clips_to_run)}] {label:8s} {path.name}")
        try:
            baseline = _summarise(run_baseline(str(path), job_id=job_id))
            refined = _summarise(run_refined(str(path), job_id=job_id))
            results.append({"source_filename": path.name, "ground_truth": label,
                            "baseline": baseline, "refined": refined})
        except Exception as exc:                       # one bad clip must not stop the whole run
            print(f"    FAILED: {exc}")
            failed.append({"source_filename": path.name, "ground_truth": label, "error": str(exc)[:300]})
        finally:
            _remove_outputs(job_id)

        # Save after every clip so an interrupted run still leaves usable results.
        OUT_PATH.write_text(json.dumps({
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dataset": "RWF-2000", "split": args.split, "seed": args.seed,
            "per_class": args.per_class, "sampling": "random, demo gallery clips excluded",
            "clips": results, "failed": failed,
        }, indent=2))

    _print_summary(results)
    with_timeline = sum("timeline" in c["baseline"] and "timeline" in c["refined"] for c in results)
    if results and with_timeline < len(results):
        print("\nNote: the pipelines return no per-frame scores, so the panel cannot show alert flicker yet.")
    print(f"\nWrote {len(results)} clips ({len(failed)} failed) to {OUT_PATH} "
          f"in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()