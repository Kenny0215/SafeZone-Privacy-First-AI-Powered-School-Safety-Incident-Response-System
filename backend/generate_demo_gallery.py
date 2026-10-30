"""
ONE-TIME precompute script for the demo gallery — run this yourself,
ahead of the demo, NOT during it.

Runs BOTH real pipelines (baseline YOLO+ByteTrack, refined YOLO+MoViNet)
on a hand-picked set of RWF-2000 clips AT THEIR FULL ORIGINAL LENGTH (no
trimming — RWF-2000 clips are already short, ~5s each), and saves the
results to app/static/demo_gallery.json. The frontend's demo gallery then
just reads that file instantly — no live inference, no waiting, during
the actual demo.

This used to pick clips RANDOMLY from the RWF-2000 val set. It no longer
does — calibrate_thresholds.py showed that several randomly-picked clips
don't give a clean result with the current pretrained-not-fine-tuned
pipelines (see its per-clip accuracy table), so CURATED_CLIPS below is a
hand-picked set chosen because it DOES give a clean, convincing result.
Swap any entry's filename_stem to try a different clip.

This does NOT write anything to Supabase. It's purely for the fast,
pre-baked demo gallery; your real `incidents` table only gets rows from
actual live uploads through /api/analyze, which is the intentional,
honest distinction to keep in mind for your report.

Usage (from the safezone-backend folder, venv active):
    python generate_demo_gallery.py

Re-run any time to regenerate (e.g. after tuning thresholds in .env, or
after changing CURATED_CLIPS below) — it overwrites
app/static/demo_gallery.json each time. This step itself is allowed to
take a while (several minutes for 6 full-length clips through both
pipelines on CPU) since it only runs once, ahead of time — the whole
point is that the demo itself then has zero wait.
"""
import json
import uuid
from pathlib import Path

from app.config import settings
from app.incident_logic import combine_pipeline_results
from app.pipelines.baseline_yolo_bytetrack import run_baseline
from app.pipelines.refined_yolo_movinet import run_refined

RWF_VAL_DIR = Path("data/RWF-2000/val")
MANIFEST_PATH = Path("app/static/demo_gallery.json")
OUTPUT_DIR = Path(settings.static_output_dir)

# Matches your frontend's actual seedData.ts zones, all of which are
# privacyLevel 'Permitted Surveillance' (video allowed). "Public Area" =
# high-traffic open zones. "Semi-Private Area" = still CCTV-permitted,
# but lower-traffic / access-controlled zones. Neither touches the app's
# 'Strictly Private (No Video)' zones (toilets etc.) — those never get
# video, by design.
CATEGORIES = {
    "public": {"label": "Public Area"},
    "semi_private": {"label": "Semi-Private Area"},
}

# Hand-picked clips — chosen for a clean, convincing result with the
# current pretrained pipelines. filename_stem is the RWF-2000 clip's
# filename WITHOUT extension (we try .avi then .mp4, then fall back to a
# prefix match) — e.g. "0Ow4cotKOuw_4" for 0Ow4cotKOuw_4.avi.
CURATED_CLIPS = [
    {"filename_stem": "0Ow4cotKOuw_4", "ground_truth": "Fight", "category": "public", "zone_name": "Courtyard"},
    {"filename_stem": "RTHTRS_697", "ground_truth": "Fight", "category": "public", "zone_name": "Cafeteria"},
    {"filename_stem": "Wq0BuA8GM84_0", "ground_truth": "NonFight", "category": "public", "zone_name": "Main Corridor"},
    {"filename_stem": "39BFeYnbu-I_4", "ground_truth": "Fight", "category": "semi_private", "zone_name": "Classroom Corridor B"},
    {"filename_stem": "6doZoiaG9PM_3", "ground_truth": "NonFight", "category": "semi_private", "zone_name": "Sports Hall & Gym"},
    {"filename_stem": "fO2vb61DcUk_0", "ground_truth": "NonFight", "category": "semi_private", "zone_name": "Staircase East"},
]


def _find_clip(stem: str, ground_truth: str) -> Path:
    folder = RWF_VAL_DIR / ground_truth
    if not folder.exists():
        raise SystemExit(f"Expected {folder} to exist. Adjust RWF_VAL_DIR if your dataset lives elsewhere.")
    for ext in (".avi", ".mp4"):
        candidate = folder / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    # Fall back to a prefix match in case the exact extension/casing differs.
    matches = sorted(folder.glob(f"{stem}*"))
    if matches:
        return matches[0]
    raise SystemExit(
        f"Could not find a clip named '{stem}' (.avi or .mp4) in {folder}. "
        f"Double-check the filename in CURATED_CLIPS."
    )


def _cleanup_old_outputs() -> None:
    """Removes leftover output videos from PREVIOUS demo-gallery/
    calibration runs before generating fresh ones. Only touches files
    tagged "demo_" or "calib_" — a real incident's video from a live
    /api/analyze upload has no such prefix (just a bare job id, e.g.
    baseline_7e934109f7.mp4) and is never touched by this."""
    if not OUTPUT_DIR.exists():
        return
    removed = 0
    for pattern in ("*demo_*.mp4", "*calib_*.mp4"):
        for old_file in OUTPUT_DIR.glob(pattern):
            old_file.unlink()
            removed += 1
    if removed:
        print(f"Removed {removed} old demo/calibration output video(s) from {OUTPUT_DIR}")


def main() -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    _cleanup_old_outputs()
    manifest: list[dict] = []

    for i, clip in enumerate(CURATED_CLIPS):
        source_path = _find_clip(clip["filename_stem"], clip["ground_truth"])
        job_id = uuid.uuid4().hex[:8]
        cat_info = CATEGORIES[clip["category"]]

        print(f"\n=== [{i + 1}/{len(CURATED_CLIPS)}] {clip['zone_name']} — {source_path.name} "
              f"(ground truth: {clip['ground_truth']}, full-length, no trimming) ===")

        print("--- running baseline pipeline ---")
        baseline_result = run_baseline(str(source_path), job_id=f"demo_{job_id}")
        print("--- running refined pipeline ---")
        refined_result = run_refined(str(source_path), job_id=f"demo_{job_id}")

        # Shared with analyze.py's /api/analyze route — see
        # combine_pipeline_results' docstring for why this isn't a plain
        # `baseline.flagged or refined.flagged` OR.
        combined = combine_pipeline_results(baseline_result, refined_result)
        overall_flagged = combined["overall_flagged"]
        severity = combined["severity"]

        manifest.append(
            {
                "id": job_id,
                "category": clip["category"],
                "category_label": cat_info["label"],
                "zone_name": clip["zone_name"],
                "label": f"{clip['zone_name']} — Live Feed",
                "source_filename": source_path.name,
                "ground_truth": clip["ground_truth"],
                "baseline": baseline_result,
                "refined": refined_result,
                "overall_flagged": overall_flagged,
                "severity": severity,
            }
        )

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(f"\n✅ Wrote {len(manifest)} curated demo clips to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()