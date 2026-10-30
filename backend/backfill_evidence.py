"""
One-off: give OLD incidents an evidence image.

Incidents created before the evidence feature have a saved annotated video but no still image. For each
one this script cuts a frame from that video, saves it as <video name>_evidence.jpg next to it, and writes
the link into the incident's evidenceSummary.snapshotUrl.

Which frame: the frame where the most RED boxes are drawn (the annotated video draws red boxes only on
people the model flagged), else the middle of the clip.

Skipped: incidents with no video, a missing video file, a restricted/private-zone incident, or one that
already has an image.

Run from the backend folder (the one that contains app/):

    python backfill_evidence.py            # DRY RUN: shows what it would do, changes nothing
    python backfill_evidence.py --apply    # does it

If your table is not called "incidents":  python backfill_evidence.py --table <name>
"""
from __future__ import annotations

import argparse
import copy
from pathlib import Path

from app.config import settings
from app.evidence import pick_flagged_frame, save_evidence_frame
from app.supabase_client import get_client

def split_row(row: dict) -> tuple[dict, str | None]:
    """Return (the incident document, the column it lives in or None if the row IS the document)."""
    if "evidenceSummary" in row:
        return row, None
    for col, val in row.items():
        if isinstance(val, dict) and "evidenceSummary" in val:
            return val, col
    return row, None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the changes (default is a dry run)")
    ap.add_argument("--table", default="incidents")
    args = ap.parse_args()

    client = get_client()
    rows = client.table(args.table).select("*").execute().data or []
    print(f"{len(rows)} incident rows in '{args.table}'. {'APPLYING' if args.apply else 'DRY RUN'}\n")
    if rows:
        print(f"Columns found: {sorted(rows[0].keys())}")
        if not any("evidenceSummary" in split_row(r)[0] for r in rows):
            print("No 'evidenceSummary' field found in any row: send me the column list above.")
            return
        print()

    out_dir = Path(settings.static_output_dir)
    done = skipped = 0
    for row in rows:
        doc, col = split_row(row)
        inc_id = doc.get("id") or row.get("id")
        ev = doc.get("evidenceSummary") or {}

        if ev.get("snapshotUrl"):
            print(f"  {inc_id}: skip (already has an image)"); skipped += 1; continue
        if ev.get("isRestricted") or doc.get("privacyLevel") == "Strictly Private (No Video)":
            print(f"  {inc_id}: skip (private zone, no video allowed)"); skipped += 1; continue
        if ev.get("mediaType") != "video" or not ev.get("mediaUrl"):
            print(f"  {inc_id}: skip (no video)"); skipped += 1; continue

        video = out_dir / Path(str(ev["mediaUrl"])).name
        if not video.is_file():
            print(f"  {inc_id}: skip (video file not on this machine: {video.name})"); skipped += 1; continue

        frame_idx = pick_flagged_frame(video)
        how = f"frame {frame_idx} (most red boxes)" if frame_idx is not None else "middle of the clip"
        name = f"{video.stem}_evidence.jpg"
        zone = doc.get("location") or "Unknown zone"
        conf = (doc.get("aiAssessment") or {}).get("confidenceScore")
        caption = f"{zone} | AI confidence {conf}%" if conf is not None else zone

        if not args.apply:
            print(f"  {inc_id}: would cut {how} -> {name}"); done += 1; continue

        try:
            save_evidence_frame(video, out_dir / name, frame_index=frame_idx, caption=caption)
        except Exception as exc:  # noqa: BLE001
            print(f"  {inc_id}: FAILED to cut ({exc})"); skipped += 1; continue

        new_ev = {**ev, "hasMedia": True, "snapshotUrl": f"/static/outputs/{name}"}
        if col is None:
            update = {"evidenceSummary": new_ev}
        else:
            new_doc = copy.deepcopy(doc)
            new_doc["evidenceSummary"] = new_ev
            update = {col: new_doc}
        client.table(args.table).update(update).eq("id", row["id"]).execute()
        print(f"  {inc_id}: saved {name} ({how})"); done += 1

    print(f"\n{'Updated' if args.apply else 'Would update'} {done}, skipped {skipped}.")
    if not args.apply and done:
        print("Run again with --apply to do it.")


if __name__ == "__main__":
    main()