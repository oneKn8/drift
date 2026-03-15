"""API routes for arrangement, loop detection, and mix rendering."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import UPLOAD_DIR, ARRANGEMENTS_DIR, EXPORTS_DIR

router = APIRouter(prefix="/api", tags=["arrange"])


class ArrangeRequest(BaseModel):
    track_ids: list[str]


class MixRenderRequest(BaseModel):
    arrangement_id: str
    format: Literal["FLAC", "WAV"] = "FLAC"
    sample_rate: Literal[44100, 48000, 96000] = 48000
    bit_depth: Literal[16, 24] = 24
    lufs_target: float = Field(default=-14.0, ge=-20.0, le=-8.0)


@router.post("/arrange")
def arrange_tracks(request: ArrangeRequest):
    """Auto-arrange tracks. Runs in thread pool (sync def)."""
    from app.services.arrangement import auto_arrange

    if not request.track_ids:
        raise HTTPException(status_code=400, detail="No track IDs provided")

    try:
        result = auto_arrange(request.track_ids)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return result


@router.post("/loop/{track_id}")
def detect_loop_endpoint(track_id: str):
    """Detect loop points. Runs in thread pool (sync def) to avoid blocking event loop."""
    from app.services.loop_detect import detect_loop

    meta_path = UPLOAD_DIR / ".meta" / f"{track_id}.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")

    try:
        result = detect_loop(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return result


@router.post("/mix/render")
async def render_mix_endpoint(request: MixRenderRequest):
    from app.tasks.mix_render import render_mix_task

    arr_path = ARRANGEMENTS_DIR / f"{request.arrangement_id}.json"
    if not arr_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Arrangement not found: {request.arrangement_id}",
        )

    task = render_mix_task.delay(
        arrangement_id=request.arrangement_id,
        fmt=request.format,
        target_sr=request.sample_rate,
        bit_depth=request.bit_depth,
        lufs_target=request.lufs_target,
    )

    return {"task_id": task.id, "arrangement_id": request.arrangement_id}


@router.get("/mix/status/{mix_id}")
async def get_mix_status(mix_id: str):
    for ext in ["flac", "wav"]:
        output_path = EXPORTS_DIR / mix_id / f"mix.{ext}"
        if output_path.exists():
            return {
                "status": "complete",
                "mix_id": mix_id,
                "output_path": f"/audio/exports/{mix_id}/mix.{ext}",
            }

    return {"status": "pending", "mix_id": mix_id}
