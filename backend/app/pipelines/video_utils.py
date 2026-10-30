
import os
import shutil
import subprocess


def reencode_to_h264_inplace(path: str) -> bool:

    if shutil.which("ffmpeg") is None:
        print(f"[video_utils] ffmpeg not found on PATH — leaving {path} as mp4v "
              f"(it may not play in a browser <video> tag; install ffmpeg and "
              f"make sure it's on PATH in the terminal running uvicorn).")
        return False

    tmp_path = path + ".h264.mp4"
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", path,
                "-c:v", "libx264", "-preset", "veryfast",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                tmp_path,
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode != 0:
            print(f"[video_utils] ffmpeg re-encode failed for {path}: "
                  f"{result.stderr[-800:]}")
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False

        os.replace(tmp_path, path)
        print(f"[video_utils] re-encoded {path} to H.264 for browser playback")
        return True

    except Exception as exc:  # noqa: BLE001
        print(f"[video_utils] ffmpeg re-encode error for {path}: {exc}")
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return False