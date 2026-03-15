"""DeepFilterNet-based audio denoising service.

Uses DeepFilterNet3 to remove background noise from audio tracks.
Input audio is converted to WAV at the model's native sample rate (48kHz),
processed through the neural network, and saved as a denoised WAV file.
"""

from pathlib import Path
from typing import Optional

import librosa
import soundfile as sf
import torch
import torchaudio
from loguru import logger

from app.config import PIPELINE_DIR


def denoise_track(
    input_path: Path,
    track_id: str,
    model: str = "deepfilternet",
) -> Path:
    """Denoise an audio track using DeepFilterNet.

    Loads the input audio file (any format supported by librosa), converts
    it to WAV at the model's native sample rate, runs the DeepFilterNet3
    enhance pipeline, and writes the denoised output as WAV.

    Args:
        input_path: Path to the input audio file (mp3, wav, flac, etc.).
        track_id: Unique identifier for the track, used to create the output directory.
        model: Model identifier. Currently only "deepfilternet" is supported.

    Returns:
        Path to the denoised WAV output file.

    Raises:
        FileNotFoundError: If the input file does not exist.
        ValueError: If the input audio is empty or unreadable.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Create output directory
    output_dir = PIPELINE_DIR / track_id / "denoise"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "denoised.wav"

    logger.info(
        "Starting denoise for track_id={} input={}", track_id, input_path.name
    )

    # Step 1: Convert input to WAV at model sample rate using librosa + soundfile.
    # DeepFilterNet3 expects 48kHz audio.
    from df.enhance import init_df
    from df.model import ModelParams

    df_model, df_state, _suffix = init_df(log_level="WARNING", log_file=None)
    target_sr = ModelParams().sr  # 48000

    temp_wav = output_dir / "_temp_input.wav"
    try:
        audio_np, sr = librosa.load(str(input_path), sr=target_sr, mono=False)
        # librosa returns (samples,) for mono, (channels, samples) for stereo
        if audio_np.ndim == 1:
            audio_np = audio_np.reshape(1, -1)
        sf.write(str(temp_wav), audio_np.T, target_sr, subtype="FLOAT")

        # Step 2: Load WAV with torchaudio for the enhance pipeline.
        audio_tensor, loaded_sr = torchaudio.load(str(temp_wav))
        # audio_tensor shape: [channels, samples]

        if loaded_sr != target_sr:
            audio_tensor = torchaudio.functional.resample(
                audio_tensor, loaded_sr, target_sr
            )

        logger.info(
            "Audio loaded: shape={} sr={}", audio_tensor.shape, target_sr
        )

        # Step 3: Run DeepFilterNet enhance.
        from df.enhance import enhance

        enhanced_audio = enhance(df_model, df_state, audio_tensor)
        # enhanced_audio shape: [channels, samples]

        # Step 4: Save enhanced audio with torchaudio.
        torchaudio.save(
            str(output_path),
            enhanced_audio.cpu(),
            sample_rate=target_sr,
        )

        logger.info(
            "Denoise complete: output={} size={}",
            output_path,
            output_path.stat().st_size,
        )

    finally:
        # Clean up temp file
        if temp_wav.exists():
            temp_wav.unlink()

    return output_path
