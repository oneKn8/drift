"""Demucs-based audio stem separation service.

Uses HTDemucs to separate audio tracks into individual stems:
drums, bass, other, and vocals.
"""

from pathlib import Path
from typing import Callable, Dict, Optional

import torch
import torchaudio
from loguru import logger

from app.config import PIPELINE_DIR


def separate_stems(
    input_path: Path,
    track_id: str,
    model: str = "htdemucs",
    progress_callback: Optional[Callable[[float], None]] = None,
) -> Dict[str, str]:
    """Separate an audio track into individual stems using Demucs.

    Loads the input audio, runs HTDemucs source separation, and saves
    each stem (vocals, drums, bass, other) as a WAV file.

    Args:
        input_path: Path to the input audio file.
        track_id: Unique identifier for the track, used to create the output directory.
        model: Demucs model name. Default is "htdemucs".
        progress_callback: Optional callable receiving a float 0.0-1.0 for progress updates.

    Returns:
        Dict mapping stem names to their output file paths as strings.
        Keys are: "vocals", "drums", "bass", "other".

    Raises:
        FileNotFoundError: If the input file does not exist.
        RuntimeError: If separation fails.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Create output directory
    output_dir = PIPELINE_DIR / track_id / "stems"
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Starting stem separation for track_id={} input={} model={}",
        track_id,
        input_path.name,
        model,
    )

    # Step 1: Load the pretrained model.
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.separate import load_track

    demucs_model = get_model(name=model)
    demucs_model.cpu()
    demucs_model.eval()

    model_sr = demucs_model.samplerate
    audio_channels = demucs_model.audio_channels
    source_names = demucs_model.sources  # ['drums', 'bass', 'other', 'vocals']

    logger.info(
        "Model loaded: sources={} sr={} channels={}",
        source_names,
        model_sr,
        audio_channels,
    )

    # Step 2: Load and prepare audio.
    # load_track handles format conversion, resampling, and channel conversion
    # via ffmpeg or torchaudio fallback.
    wav = load_track(input_path, audio_channels, model_sr)
    # wav shape: [channels, samples]

    # Normalize as done in demucs.separate.main
    ref = wav.mean(0)
    wav -= ref.mean()
    wav /= ref.std() + 1e-8

    if progress_callback is not None:
        progress_callback(0.1)

    # Step 3: Run separation.
    # apply_model expects [batch, channels, samples] and returns [batch, sources, channels, samples]
    sources = apply_model(
        demucs_model,
        wav[None],
        device="cpu",
        shifts=1,
        split=True,
        overlap=0.25,
        progress=True,
    )[0]
    # sources shape: [sources, channels, samples]

    # Denormalize
    sources *= ref.std() + 1e-8
    sources += ref.mean()

    if progress_callback is not None:
        progress_callback(0.8)

    # Step 4: Save each stem as WAV.
    stem_paths: Dict[str, str] = {}
    for idx, stem_name in enumerate(source_names):
        stem_audio = sources[idx]  # [channels, samples]
        stem_path = output_dir / f"{stem_name}.wav"

        torchaudio.save(
            str(stem_path),
            stem_audio.cpu(),
            sample_rate=model_sr,
        )

        stem_paths[stem_name] = str(stem_path)
        logger.info(
            "Saved stem '{}': path={} size={}",
            stem_name,
            stem_path,
            stem_path.stat().st_size,
        )

    if progress_callback is not None:
        progress_callback(1.0)

    logger.info("Stem separation complete for track_id={}", track_id)
    return stem_paths
