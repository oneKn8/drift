import pytest
from pathlib import Path
from app.services.analysis import analyze_track

SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


def get_sample_file():
    mp3s = list(SAMPLE_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files in data/uploads for testing")
    return mp3s[0]


def test_analyze_returns_required_fields():
    path = get_sample_file()
    result = analyze_track(path)
    assert "bpm" in result
    assert "key" in result
    assert "duration" in result
    assert "sample_rate" in result
    assert "channels" in result
    assert "energy" in result
    assert "waveform_peaks" in result


def test_bpm_is_reasonable():
    path = get_sample_file()
    result = analyze_track(path)
    assert 20 < result["bpm"] < 300


def test_duration_is_positive():
    path = get_sample_file()
    result = analyze_track(path)
    assert result["duration"] > 0


def test_key_is_valid():
    path = get_sample_file()
    result = analyze_track(path)
    valid_keys = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
        "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
    ]
    assert result["key"] in valid_keys


def test_waveform_peaks_length():
    path = get_sample_file()
    result = analyze_track(path)
    assert 100 < len(result["waveform_peaks"]) < 10000


def test_energy_is_float():
    path = get_sample_file()
    result = analyze_track(path)
    assert isinstance(result["energy"], float)
    assert 0 <= result["energy"] <= 1
