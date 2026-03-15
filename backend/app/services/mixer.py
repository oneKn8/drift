"""Mix rendering and loop export service."""

from pathlib import Path
from typing import Callable

import librosa
import numpy as np
import soundfile as sf


def equal_power_crossfade(n_samples: int) -> tuple[np.ndarray, np.ndarray]:
    """Generate equal-power crossfade curves.

    Returns a (fade_in, fade_out) pair where fade_in**2 + fade_out**2 ~= 1.0
    at every sample, preserving perceived loudness through the transition.

    Args:
        n_samples: Number of samples in the crossfade region.

    Returns:
        Tuple of (fade_in, fade_out) numpy arrays each of length n_samples.
    """
    t = np.linspace(0, 1, n_samples)
    fade_in = np.sqrt(t)
    fade_out = np.sqrt(1 - t)
    return fade_in, fade_out


def render_mix(
    track_paths: list[Path],
    crossfades: list[dict],
    output_path: Path,
    target_sr: int = 48000,
    fmt: str = "FLAC",
    bit_depth: int = 24,
    lufs_target: float = -14.0,
    progress_callback: Callable[[float], None] | None = None,
) -> Path:
    """Render a mix from ordered tracks with crossfades between them.

    Loads each track, resamples to target_sr if needed, applies equal-power
    crossfades at boundaries, normalizes to target LUFS, and writes the result.

    Args:
        track_paths: Ordered list of audio file paths to concatenate.
        crossfades: List of crossfade specs, one per adjacent pair.
            Each dict must have "duration_s" (float) and "type" (str).
        output_path: Where to write the rendered mix.
        target_sr: Target sample rate for the output.
        fmt: Output format (FLAC, WAV, etc.).
        bit_depth: Bit depth for WAV output.
        lufs_target: Target integrated loudness in LUFS.
        progress_callback: Optional callback receiving progress as 0.0-1.0.

    Returns:
        The output_path after successful write.
    """
    import pyloudnorm as pyln

    audios: list[np.ndarray] = []
    for i, path in enumerate(track_paths):
        y, sr = sf.read(str(path), dtype="float32")
        if sr != target_sr:
            if y.ndim == 2:
                channels = [
                    librosa.resample(y[:, c], orig_sr=sr, target_sr=target_sr)
                    for c in range(y.shape[1])
                ]
                y = np.stack(channels, axis=-1)
            else:
                y = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
        if y.ndim == 1:
            y = np.stack([y, y], axis=-1)
        audios.append(y)
        if progress_callback:
            progress_callback((i + 1) / (len(track_paths) * 2))

    segments: list[np.ndarray] = []
    for i, audio in enumerate(audios):
        if i == 0:
            segments.append(audio)
        else:
            xfade = crossfades[i - 1]
            xfade_samples = int(xfade["duration_s"] * target_sr)
            xfade_samples = min(xfade_samples, len(segments[-1]), len(audio))

            fade_in, fade_out = equal_power_crossfade(xfade_samples)
            fade_in_2d = fade_in.reshape(-1, 1)
            fade_out_2d = fade_out.reshape(-1, 1)

            prev_tail = segments[-1][-xfade_samples:] * fade_out_2d
            curr_head = audio[:xfade_samples] * fade_in_2d
            overlap = prev_tail + curr_head

            segments[-1] = segments[-1][:-xfade_samples]
            segments.append(overlap)
            segments.append(audio[xfade_samples:])

        if progress_callback:
            progress_callback(0.5 + (i + 1) / (len(audios) * 2))

    mixed = np.concatenate(segments, axis=0)

    meter = pyln.Meter(target_sr)
    loudness = meter.integrated_loudness(mixed)
    if np.isfinite(loudness):
        mixed = pyln.normalize.loudness(mixed, loudness, lufs_target)

    mixed = np.clip(mixed, -1.0, 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    subtype = f"PCM_{bit_depth}" if fmt.upper() == "WAV" else None
    sf.write(str(output_path), mixed, target_sr, format=fmt.upper(), subtype=subtype)

    if progress_callback:
        progress_callback(1.0)

    return output_path


def render_loop(
    track_path: Path,
    loop_start: float,
    loop_end: float,
    crossfade_s: float,
    output_path: Path,
    target_sr: int = 48000,
    fmt: str = "FLAC",
    bit_depth: int = 24,
) -> Path:
    """Render a seamless loop file from a region of a track.

    Extracts the region [loop_start, loop_end], then crossfades the tail
    into the head so the loop plays back seamlessly when repeated.

    Args:
        track_path: Path to the source audio file.
        loop_start: Start of loop region in seconds.
        loop_end: End of loop region in seconds.
        crossfade_s: Crossfade duration in seconds applied at loop boundary.
        output_path: Where to write the rendered loop.
        target_sr: Target sample rate for the output.
        fmt: Output format (FLAC, WAV, etc.).
        bit_depth: Bit depth for WAV output.

    Returns:
        The output_path after successful write.
    """
    y, sr = sf.read(str(track_path), dtype="float32")
    if sr != target_sr:
        if y.ndim == 2:
            channels = [
                librosa.resample(y[:, c], orig_sr=sr, target_sr=target_sr)
                for c in range(y.shape[1])
            ]
            y = np.stack(channels, axis=-1)
        else:
            y = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
    if y.ndim == 1:
        y = np.stack([y, y], axis=-1)

    start_sample = int(loop_start * target_sr)
    end_sample = int(loop_end * target_sr)
    xfade_samples = int(crossfade_s * target_sr)

    start_sample = max(0, start_sample)
    end_sample = min(len(y), end_sample)
    loop_len = end_sample - start_sample
    xfade_samples = min(xfade_samples, loop_len // 2)

    loop_audio = y[start_sample:end_sample].copy()

    head = loop_audio[:xfade_samples]
    tail = loop_audio[-xfade_samples:]
    body = loop_audio[xfade_samples:-xfade_samples]

    fade_in, fade_out = equal_power_crossfade(xfade_samples)
    fade_in_2d = fade_in.reshape(-1, 1)
    fade_out_2d = fade_out.reshape(-1, 1)

    transition = tail * fade_out_2d + head * fade_in_2d
    output = np.concatenate([transition, body], axis=0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    subtype = f"PCM_{bit_depth}" if fmt.upper() == "WAV" else None
    sf.write(str(output_path), output, target_sr, format=fmt.upper(), subtype=subtype)

    return output_path
