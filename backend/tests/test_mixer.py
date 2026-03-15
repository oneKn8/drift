"""Tests for the mix rendering service."""

import numpy as np
import pytest
import soundfile as sf

from app.services.mixer import render_mix, render_loop, equal_power_crossfade


@pytest.fixture
def two_tracks(tmp_path):
    sr = 44100
    duration = 4.0
    samples = int(sr * duration)
    t = np.linspace(0, duration, samples, endpoint=False)

    track_a = np.stack([
        0.3 * np.sin(2 * np.pi * 440 * t),
        0.3 * np.sin(2 * np.pi * 440 * t),
    ], axis=-1).astype(np.float32)
    track_b = np.stack([
        0.3 * np.sin(2 * np.pi * 554 * t),
        0.3 * np.sin(2 * np.pi * 554 * t),
    ], axis=-1).astype(np.float32)

    path_a = tmp_path / "a.wav"
    path_b = tmp_path / "b.wav"
    sf.write(str(path_a), track_a, sr)
    sf.write(str(path_b), track_b, sr)

    return path_a, path_b, sr


def test_equal_power_crossfade_sums_near_one():
    n = 1000
    fade_in, fade_out = equal_power_crossfade(n)
    power_sum = fade_in ** 2 + fade_out ** 2
    assert np.allclose(power_sum, 1.0, atol=0.01)


def test_render_mix_creates_file(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.flac"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    result = render_mix([path_a, path_b], crossfades, output, target_sr=sr)
    assert result.exists()
    info = sf.info(str(result))
    assert info.samplerate == sr


def test_render_mix_duration(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.wav"
    xfade_s = 1.0
    crossfades = [{"duration_s": xfade_s, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr, fmt="WAV")
    info = sf.info(str(output))
    expected = 4.0 + 4.0 - xfade_s
    assert abs(info.duration - expected) < 0.5


def test_render_mix_not_silent(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.flac"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr)
    data, _ = sf.read(str(output))
    rms = float(np.sqrt(np.mean(data ** 2)))
    assert rms > 0.01


def test_render_mix_not_clipped(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.flac"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr)
    data, _ = sf.read(str(output))
    assert np.max(np.abs(data)) <= 1.0


def test_render_mix_wav_format(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.wav"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr, fmt="WAV", bit_depth=24)
    info = sf.info(str(output))
    assert info.format == "WAV"
    assert info.subtype == "PCM_24"


def test_render_loop_creates_file(two_tracks, tmp_path):
    path_a, _, sr = two_tracks
    output = tmp_path / "loop.flac"
    result = render_loop(path_a, 0.5, 3.5, 0.5, output, target_sr=sr)
    assert result.exists()


def test_render_loop_duration(two_tracks, tmp_path):
    path_a, _, sr = two_tracks
    output = tmp_path / "loop.flac"
    render_loop(path_a, 0.5, 3.5, 0.5, output, target_sr=sr)
    info = sf.info(str(output))
    expected = 3.0 - 0.5
    assert abs(info.duration - expected) < 0.5
