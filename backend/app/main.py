from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import alerts, analyze, demo_gallery, demo_incidents, incidents, sos, student_reports, zones

app = FastAPI(
    title="SafeZone API",
    description="AI for Safer Schools — baseline (YOLO+ByteTrack) vs refined (YOLO+MoViNet) detection backend.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serves annotated output videos (and raw uploads if ever needed) so the
# frontend can play them directly via <video src="http://.../static/outputs/...">
app.mount("/static/outputs", StaticFiles(directory=settings.static_output_dir), name="outputs")
app.mount("/static/uploads", StaticFiles(directory=settings.static_upload_dir), name="uploads")

app.include_router(analyze.router)
app.include_router(incidents.router)
app.include_router(sos.router)
app.include_router(demo_gallery.router)
app.include_router(demo_incidents.router)
app.include_router(zones.router)
app.include_router(alerts.router)
app.include_router(student_reports.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}