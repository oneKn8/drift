"""Audio super-resolution service.

Upsamples audio to 48kHz using DSP-based resampling via librosa.
Structured to allow swapping in a neural model (e.g., FlashSR) later.
"""

import logging
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from app.config import PIPELINE_DIR

logger = logging.getLogger(__name__)

TARGET_SR = 48000


def upscale_audio(
    input_path: Path,
    track_id: str,
    model: str = "flashsr",
) -> Path:
    """Upscale audio to 48kHz sample rate.

    Loads the input audio file, resamples to 48kHz if the native sample rate
    is lower, and writes the result as a 24-bit WAV file.

    Args:
        input_path: Path to the source audio file (MP3, WAV, FLAC, etc.).
        track_id: Unique identifier for the track, used to organize output.
        model: Model identifier. Currently uses DSP resampling for all values.
            Reserved for future neural model support.

    Returns:
        Path to the upscaled WAV file at 48kHz.

    Raises:
        FileNotFoundError: If the input file does not exist.
        RuntimeError: If audio loading or processing fails.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    output_dir = PIPELINE_DIR / track_id / "super_resolution"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "upscaled.wav"

    logger.info(
        "Upscaling %s (track_id=%s, model=%s)",
        input_path.name,
        track_id,
        model,
    )

    try:
        y, sr = librosa.load(str(input_path), sr=None, mono=False)
    except Exception as exc:
        raise RuntimeError(f"Failed to load audio from {input_path}: {exc}") from exc

    # librosa.load returns shape (samples,) for mono or (channels, samples) for stereo
    is_mono = y.ndim == 1

    if sr < TARGET_SR:
        logger.info("Resampling from %d Hz to %d Hz", sr, TARGET_SR)
        if is_mono:
            y_resampled = librosa.resample(y, orig_sr=sr, target_sr=TARGET_SR)
        else:
            # Resample each channel independently
            channels = []
            for ch in range(y.shape[0]):
                channels.append(
                    librosa.resample(y[ch], orig_sr=sr, target_sr=TARGET_SR)
                )
            y_resampled = np.stack(channels, axis=0)
        output_sr = TARGET_SR
    else:
        logger.info(
            "Sample rate %d Hz already >= %d Hz, no resampling needed",
            sr,
            TARGET_SR,
        )
        y_resampled = y
        output_sr = sr

    # soundfile expects shape (samples, channels) for multi-channel
    if not is_mono:
        y_resampled = y_resampled.T

    try:
        sf.write(str(output_path), y_resampled, output_sr, subtype="PCM_24")
    except Exception as exc:
        raise RuntimeError(f"Failed to write output to {output_path}: {exc}") from exc

    logger.info("Upscaled audio saved to %s (%d Hz)", output_path, output_sr)
    return output_path
