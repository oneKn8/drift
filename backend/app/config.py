from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
STEMS_DIR = DATA_DIR / "stems"
ENHANCED_DIR = DATA_DIR / "enhanced"
EXPORTS_DIR = DATA_DIR / "exports"
MODELS_DIR = DATA_DIR / "models"

PIPELINE_DIR = DATA_DIR / "enhanced"

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".alac"}
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB

REDIS_URL = "redis://localhost:6379/0"

PIPELINE_STAGES = ["denoise", "separate", "super_resolution", "master"]

DENOISE_MODELS = {"deepfilternet": "DeepFilterNet3"}
SEPARATION_MODELS = {"htdemucs": "htdemucs", "htdemucs_ft": "htdemucs_ft"}
SR_MODELS = {"flashsr": "FlashSR (ONNX)"}
MASTER_MODELS = {"matchering": "Matchering"}

for d in [UPLOAD_DIR, STEMS_DIR, ENHANCED_DIR, EXPORTS_DIR, MODELS_DIR, PIPELINE_DIR]:
    d.mkdir(parents=True, exist_ok=True)
