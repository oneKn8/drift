"""API route for listing available ambient texture files."""

from fastapi import APIRouter

from app.config import TEXTURES_DIR, ALLOWED_EXTENSIONS

router = APIRouter(prefix="/api", tags=["textures"])


@router.get("/textures")
def list_textures():
    """List audio files available in the textures directory."""
    if not TEXTURES_DIR.exists():
        return {"textures": []}

    files = []
    for f in sorted(TEXTURES_DIR.iterdir()):
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            files.append({"name": f.name, "path": f"/audio/textures/{f.name}"})

    return {"textures": files}
