from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
STEMS_DIR = DATA_DIR / "stems"
ENHANCED_DIR = DATA_DIR / "enhanced"
EXPORTS_DIR = DATA_DIR / "exports"
MODELS_DIR = DATA_DIR / "models"

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".alac"}
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB

REDIS_URL = "redis://localhost:6379/0"

for d in [UPLOAD_DIR, STEMS_DIR, ENHANCED_DIR, EXPORTS_DIR, MODELS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
