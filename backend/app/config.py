"""
Central app configuration, loaded from environment variables (.env).
Everything a pipeline or router needs to know about paths/keys/thresholds
lives here so there's one place to tune before the demo.
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reads both filenames if present; later files in the tuple override
    # earlier ones for any key defined in both. So .env.local wins over
    # .env if you happen to have both.
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"), env_file_encoding="utf-8", extra="ignore"
    )

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    dashboard_url: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_anon_key: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # Models
    yolo_model_path: str = "yolov8n-pose.pt"
    movinet_model_dir: str = "./app/models/movinet_a0"

    # Static dirs
    static_output_dir: str = "./app/static/outputs"
    static_upload_dir: str = "./app/static/uploads"

    # Thresholds — see calibrate_thresholds.py for a data-driven way to
    # pick these against your own labeled demo gallery clips instead of
    # guessing. These defaults are a starting point, not tuned values.
    yolo_conf_threshold: float = 0.4
    movinet_violence_threshold: float = 0.55
    baseline_proximity_px: float = 120.0
    baseline_motion_spike: float = 35.0
    # Fraction of a clip's frames that must show the baseline's
    # proximity+motion-spike pattern before the WHOLE clip is flagged.
    # Was hardcoded as 0.03 inside the pipeline; moved here so it's
    # tunable from .env like the other thresholds.
    baseline_flag_ratio_threshold: float = 0.03
    # Same idea for the refined pipeline — was hardcoded as 0.03 inside
    # refined_yolo_movinet.py.
    refined_flag_ratio_threshold: float = 0.03

    # Per-keypoint confidence floor (0-1) below which a wrist/ankle is
    # treated as "not actually observed this frame" for the limb-speed
    # calc. YOLO-pose still outputs a position for an occluded keypoint —
    # it's a guess, not an observation — and that guess jumping around
    # frame-to-frame was producing fake motion-spike triggers on grainy
    # CCTV footage that had nothing to do with real punches/kicks.
    min_keypoint_confidence: float = 0.5

    # Path to the ByteTrack tracker config the baseline pipeline passes
    # to model.track(tracker=...). Points at our own tuned copy (see
    # app/pipelines/bytetrack_tuned.yaml) instead of ultralytics'
    # built-in "bytetrack.yaml" — the default track_buffer (30 frames)
    # was dropping and re-creating track IDs on brief occlusions in
    # grainy/crowded footage, which also starves the refined pipeline's
    # MoViNet scoring (it needs a continuous run of frames per track).
    baseline_tracker_config: str = "app/pipelines/bytetrack_tuned.yaml"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()

# Make sure working directories exist at import time.
Path(settings.static_output_dir).mkdir(parents=True, exist_ok=True)
Path(settings.static_upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.movinet_model_dir).mkdir(parents=True, exist_ok=True)