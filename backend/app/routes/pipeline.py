"""Pipeline API routes for triggering and monitoring enhancement pipelines."""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import PIPELINE_DIR, PIPELINE_STAGES

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


class PipelineRunRequest(BaseModel):
    """Request body for starting a pipeline run."""

    track_id: str
    stages: Optional[list[str]] = None
    models: Optional[dict[str, str]] = None


class PipelineRunResponse(BaseModel):
    """Response body after queueing a pipeline run."""

    task_id: str
    track_id: str


@router.post("/run", response_model=PipelineRunResponse)
async def run_pipeline_endpoint(request: PipelineRunRequest):
    """Queue a pipeline run for the given track.

    Dispatches the pipeline Celery task asynchronously and returns
    the Celery task ID along with the track ID for status tracking.
    """
    from app.tasks.pipeline import run_pipeline

    # Validate stages if provided
    if request.stages:
        invalid = [s for s in request.stages if s not in PIPELINE_STAGES]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown pipeline stages: {invalid}",
            )

    task = run_pipeline.delay(
        track_id=request.track_id,
        stages=request.stages,
        models=request.models,
    )

    return PipelineRunResponse(task_id=task.id, track_id=request.track_id)


@router.get("/status/{track_id}")
async def get_pipeline_status(track_id: str):
    """Retrieve the pipeline results for a given track.

    Reads the persisted pipeline_results.json from the pipeline output
    directory. Returns 404 if no results exist yet.
    """
    results_path = PIPELINE_DIR / track_id / "pipeline_results.json"
    if not results_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No pipeline results found for track_id={track_id}",
        )

    results = json.loads(results_path.read_text())
    return results
