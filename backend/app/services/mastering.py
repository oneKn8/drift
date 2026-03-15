"""Audio mastering service using matchering.

Applies reference-based mastering to a target track by matching the spectral
and loudness characteristics of a reference track.
"""

import logging
from pathlib import Path

import matchering as mg

from app.config import PIPELINE_DIR

logger = logging.getLogger(__name__)


def master_track(
    target_path: Path,
    reference_path: Path,
    track_id: str,
) -> Path:
    """Master a target track using a reference track's characteristics.

    Uses matchering to analyze the reference track's spectral profile and
    loudness, then applies those characteristics to the target track.
    Output is a 24-bit PCM WAV file.

    Args:
        target_path: Path to the target audio file to be mastered.
        reference_path: Path to the reference audio file whose characteristics
            will be matched.
        track_id: Unique identifier for the track, used to organize output.

    Returns:
        Path to the mastered WAV file.

    Raises:
        FileNotFoundError: If either input file does not exist.
        RuntimeError: If the mastering process fails.
    """
    target_path = Path(target_path)
    reference_path = Path(reference_path)

    if not target_path.exists():
        raise FileNotFoundError(f"Target file not found: {target_path}")
    if not reference_path.exists():
        raise FileNotFoundError(f"Reference file not found: {reference_path}")

    output_dir = PIPELINE_DIR / track_id / "master"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "mastered.wav"

    logger.info(
        "Mastering target=%s with reference=%s (track_id=%s)",
        target_path.name,
        reference_path.name,
        track_id,
    )

    try:
        mg.process(
            target=str(target_path),
            reference=str(reference_path),
            results=[
                mg.Result(str(output_path), subtype="PCM_24"),
            ],
        )
    except Exception as exc:
        raise RuntimeError(
            f"Mastering failed for {target_path.name}: {exc}"
        ) from exc

    logger.info("Mastered audio saved to %s", output_path)
    return output_path
