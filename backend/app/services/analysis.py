import librosa
import numpy as np
import soundfile as sf
from pathlib import Path

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def analyze_track(path: Path) -> dict:
    path = Path(path)
    y, sr = librosa.load(str(path), sr=None, mono=True)

    info = sf.info(str(path))
    duration = info.duration
    channels = info.channels
    sample_rate = info.samplerate

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_avg = chroma.mean(axis=1)
    key_idx = int(np.argmax(chroma_avg))

    minor_profile = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0], dtype=float)
    major_profile = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], dtype=float)

    major_corr = np.corrcoef(np.roll(major_profile, key_idx), chroma_avg)[0, 1]
    minor_corr = np.corrcoef(np.roll(minor_profile, key_idx), chroma_avg)[0, 1]

    key_name = KEY_NAMES[key_idx]
    if minor_corr > major_corr:
        key_name += "m"

    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.mean(rms))
    energy = min(1.0, energy / 0.3)

    num_peaks = min(max(int(duration * 20), 200), 5000)
    waveform_peaks = _downsample_waveform(y, num_peaks)

    return {
        "bpm": round(bpm, 1),
        "key": key_name,
        "duration": round(duration, 2),
        "sample_rate": sample_rate,
        "channels": channels,
        "energy": round(energy, 4),
        "waveform_peaks": waveform_peaks,
    }


def _downsample_waveform(y: np.ndarray, num_points: int) -> list[float]:
    chunk_size = max(1, len(y) // num_points)
    peaks = []
    for i in range(0, len(y), chunk_size):
        chunk = y[i : i + chunk_size]
        peaks.append(float(np.max(np.abs(chunk))))
    return peaks[:num_points]
