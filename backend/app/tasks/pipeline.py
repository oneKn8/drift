"""Pipeline orchestrator Celery task.

Runs enhancement stages in sequence (denoise -> separate -> super_resolution -> master),
broadcasting progress updates via Redis pub/sub for real-time WebSocket delivery.
"""

import json
from pathlib import Path
from typing import Any

import redis
from loguru import logger

from app.tasks.celery_app import celery_app

from app.config import PIPELINE_DIR, PIPELINE_STAGES, UPLOAD_DIR, REDIS_URL

r = redis.Redis.from_url(REDIS_URL)

META_DIR = UPLOAD_DIR / ".meta"


def _broadcast(
    track_id: str,
    stage: str,
    status: str,
    progress: float,
    message: str = "",
) -> None:
    """Publish a pipeline progress event to Redis pub/sub."""
    payload = json.dumps({
        "type": "progress",
        "track_id": track_id,
        "stage": stage,
        "status": status,
        "progress": progress,
        "message": message,
    })
    r.publish("pipeline_progress", payload)


def _load_track_meta(track_id: str) -> dict | None:
    """Load track metadata from the upload meta directory."""
    meta_path = META_DIR / f"{track_id}.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text())
    return None


def _resolve_input_path(track_id: str, meta: dict) -> Path:
    """Resolve the original uploaded file path from track metadata."""
    return UPLOAD_DIR / meta["file_path"]


def _run_denoise(input_path: Path, track_id: str, models: dict[str, str]) -> dict[str, Any]:
    """Execute the denoise stage."""
    from app.services.denoise import denoise_track

    model = models.get("denoise", "deepfilternet")
    output_path = denoise_track(input_path, track_id, model=model)
    return {"output_path": str(output_path)}


def _run_separate(
    input_path: Path,
    track_id: str,
    models: dict[str, str],
) -> dict[str, Any]:
    """Execute the stem separation stage with progress broadcasting."""
    from app.services.separation import separate_stems

    model = models.get("separate", "htdemucs")

    def progress_callback(progress: float) -> None:
        _broadcast(track_id, "separate", "processing", progress, "Separating stems")

    stem_paths = separate_stems(
        input_path,
        track_id,
        model=model,
        progress_callback=progress_callback,
    )

    # Use "other" stem as the main output for subsequent stages.
    # Fall back to "remix" if "other" is not available, then to the first stem.
    if "other" in stem_paths:
        main_output = stem_paths["other"]
    elif "remix" in stem_paths:
        main_output = stem_paths["remix"]
    else:
        main_output = next(iter(stem_paths.values()))

    return {"output_path": main_output, "stems": stem_paths}


def _run_super_resolution(
    input_path: Path,
    track_id: str,
    models: dict[str, str],
) -> dict[str, Any]:
    """Execute the super-resolution stage."""
    from app.services.super_resolution import upscale_audio

    model = models.get("super_resolution", "flashsr")
    output_path = upscale_audio(input_path, track_id, model=model)
    return {"output_path": str(output_path)}


def _run_master(
    input_path: Path,
    reference_path: Path,
    track_id: str,
    models: dict[str, str],
) -> dict[str, Any]:
    """Execute the mastering stage using the original input as reference."""
    from app.services.mastering import master_track

    output_path = master_track(input_path, reference_path, track_id)
    return {"output_path": str(output_path)}


VALID_STAGES = {"denoise", "separate", "super_resolution", "master"}


@celery_app.task(bind=True)
def run_pipeline(
    self,
    track_id: str,
    stages: list[str] | None = None,
    models: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Orchestrate the full audio enhancement pipeline.

    Runs each requested stage in sequence, broadcasting progress via Redis
    pub/sub. Results are saved to PIPELINE_DIR/<track_id>/pipeline_results.json.

    Args:
        track_id: Unique identifier for the track to process.
        stages: List of stage names to run. Defaults to all PIPELINE_STAGES.
        models: Optional dict mapping stage names to model identifiers.

    Returns:
        Dict containing per-stage results and final output path.

    Raises:
        ValueError: If track metadata is not found or stages are invalid.
    """
    if stages is None:
        stages = list(PIPELINE_STAGES)
    if models is None:
        models = {}

    # Validate stages
    invalid = [s for s in stages if s not in VALID_STAGES]
    if invalid:
        raise ValueError(f"Unknown pipeline stages: {invalid}")

    # Load track metadata
    meta = _load_track_meta(track_id)
    if meta is None:
        raise ValueError(f"Track metadata not found for track_id={track_id}")

    original_path = _resolve_input_path(track_id, meta)
    if not original_path.exists():
        raise FileNotFoundError(f"Original audio file not found: {original_path}")

    # This is the path that feeds into each subsequent stage
    current_input = original_path
    # Keep reference to the original for the mastering stage
    reference_path = original_path

    results: dict[str, Any] = {
        "track_id": track_id,
        "stages": {},
        "status": "running",
    }

    total_stages = len(stages)

    for idx, stage in enumerate(stages):
        overall_progress = idx / total_stages
        _broadcast(track_id, stage, "processing", overall_progress, f"Starting {stage}")
        logger.info("Pipeline stage '{}' starting for track_id={}", stage, track_id)

        try:
            if stage == "denoise":
                stage_result = _run_denoise(current_input, track_id, models)
            elif stage == "separate":
                stage_result = _run_separate(current_input, track_id, models)
            elif stage == "super_resolution":
                stage_result = _run_super_resolution(current_input, track_id, models)
            elif stage == "master":
                stage_result = _run_master(
                    current_input, reference_path, track_id, models
                )
            else:
                raise ValueError(f"Unhandled stage: {stage}")

            results["stages"][stage] = {
                "status": "complete",
                "result": stage_result,
            }

            # Update current_input to the output of this stage
            if "output_path" in stage_result:
                current_input = Path(stage_result["output_path"])

            stage_progress = (idx + 1) / total_stages
            _broadcast(
                track_id, stage, "complete", stage_progress, f"{stage} complete"
            )
            logger.info(
                "Pipeline stage '{}' complete for track_id={}", stage, track_id
            )

        except Exception as exc:
            error_msg = f"Stage '{stage}' failed: {exc}"
            logger.error("Pipeline error: {}", error_msg)
            results["stages"][stage] = {
                "status": "failed",
                "error": str(exc),
            }
            results["status"] = "failed"
            results["error"] = error_msg
            _broadcast(track_id, stage, "error", 0.0, error_msg)

            # Save partial results before raising
            _save_results(track_id, results)
            raise

    results["status"] = "complete"
    results["final_output"] = str(current_input)
    _broadcast(track_id, "pipeline", "complete", 1.0, "Pipeline complete")

    _save_results(track_id, results)
    logger.info("Pipeline complete for track_id={}", track_id)
    return results


def _save_results(track_id: str, results: dict[str, Any]) -> Path:
    """Persist pipeline results to disk."""
    results_dir = PIPELINE_DIR / track_id
    results_dir.mkdir(parents=True, exist_ok=True)
    results_path = results_dir / "pipeline_results.json"
    results_path.write_text(json.dumps(results, indent=2))
    return results_path
