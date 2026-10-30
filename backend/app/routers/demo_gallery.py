
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api", tags=["demo-gallery"])

MANIFEST_PATH = Path("app/static/demo_gallery.json")


@router.get("/demo-clips")
def get_demo_clips(category: str | None = Query(None, description="public | semi_private")):
    if not MANIFEST_PATH.exists():
        raise HTTPException(
            404,
            "Demo gallery not generated yet. Run `python generate_demo_gallery.py` "
            "from the backend folder first.",
        )
    data = json.loads(MANIFEST_PATH.read_text())
    if category:
        data = [item for item in data if item.get("category") == category]
    return data