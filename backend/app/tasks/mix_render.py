"""Celery tasks for mix rendering and loop export."""

import json
from pathlib import Path
from typing import Any

import redis
from loguru import logger

from app.tasks.celery_app import celery_app
from app.config import UPLOAD_DIR, EXPORTS_DIR, ARRANGEMENTS_DIR, REDIS_URL

r = redis.Redis.from_url(REDIS_URL)


def _broadcast(mix_id: str, status: str, progress: float, message: str = "") -> None:
    payload = json.dumps({
        "type": "progress",
        "track_id": mix_id,
        "stage": "mix_render",
        "status": status,
        "progress": progress,
        "message": message,
    })
    r.publish("pipeline_progress", payload)


@celery_app.task(bind=True)
def render_mix_task(
    self,
    arrangement_id: str,
    fmt: str = "FLAC",
    target_sr: int = 48000,
    bit_depth: int = 24,
    lufs_target: float = -14.0,
) -> dict[str, Any]:
    """Render an arrangement to a single audio file."""
    from app.services.mixer import render_mix

    arr_path = ARRANGEMENTS_DIR / f"{arrangement_id}.json"
    if not arr_path.exists():
        raise ValueError(f"Arrangement not found: {arrangement_id}")

    arrangement = json.loads(arr_path.read_text())
    _broadcast(arrangement_id, "processing", 0.0, "Loading tracks")

    meta_dir = UPLOAD_DIR / ".meta"
    track_paths = []
    for tid in arrangement["tracks"]:
        meta = json.loads((meta_dir / f"{tid}.json").read_text())
        track_paths.append(UPLOAD_DIR / meta["file_path"])

    ext = "flac" if fmt.upper() == "FLAC" else "wav"
    output_path = EXPORTS_DIR / arrangement_id / f"mix.{ext}"

    def progress_cb(p: float) -> None:
        _broadcast(arrangement_id, "processing", p, "Rendering mix")

    render_mix(
        track_paths=track_paths,
        crossfades=arrangement["crossfades"],
        output_path=output_path,
        target_sr=target_sr,
        fmt=fmt,
        bit_depth=bit_depth,
        lufs_target=lufs_target,
        progress_callback=progress_cb,
    )

    _broadcast(arrangement_id, "complete", 1.0, "Mix complete")
    logger.info("Mix render complete: {}", output_path)

    return {
        "status": "complete",
        "arrangement_id": arrangement_id,
        "output_path": str(output_path),
    }


@celery_app.task(bind=True)
def render_loop_task(
    self,
    track_id: str,
    fmt: str = "FLAC",
    target_sr: int = 48000,
    bit_depth: int = 24,
) -> dict[str, Any]:
    """Render a seamless loop export for a single track."""
    from app.services.mixer import render_loop

    meta_dir = UPLOAD_DIR / ".meta"
    meta_path = meta_dir / f"{track_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Track metadata not found: {track_id}")

    meta = json.loads(meta_path.read_text())
    loop = meta.get("loop")
    if not loop or not loop.get("found"):
        raise ValueError(f"No loop detected for track: {track_id}")

    audio_path = UPLOAD_DIR / meta["file_path"]
    ext = "flac" if fmt.upper() == "FLAC" else "wav"
    output_path = EXPORTS_DIR / track_id / f"loop.{ext}"

    _broadcast(track_id, "processing", 0.0, "Rendering loop")

    render_loop(
        track_path=audio_path,
        loop_start=loop["start_s"],
        loop_end=loop["end_s"],
        crossfade_s=loop["crossfade_s"],
        output_path=output_path,
        target_sr=target_sr,
        fmt=fmt,
        bit_depth=bit_depth,
    )

    _broadcast(track_id, "complete", 1.0, "Loop export complete")
    logger.info("Loop export complete: {}", output_path)

    return {
        "status": "complete",
        "track_id": track_id,
        "output_path": str(output_path),
    }
