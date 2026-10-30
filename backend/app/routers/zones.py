from __future__ import annotations

from fastapi import APIRouter

from app.supabase_client import get_zones

router = APIRouter(prefix="/api", tags=["zones"])


@router.get("/zones")
def list_zones():
    return get_zones()