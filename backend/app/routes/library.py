import json
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, HTTPException
from app.config import UPLOAD_DIR, ALLOWED_EXTENSIONS, MAX_UPLOAD_SIZE
from app.services.analysis import analyze_track

router = APIRouter(prefix="/api/library", tags=["library"])
META_DIR = UPLOAD_DIR / ".meta"
META_DIR.mkdir(exist_ok=True)


def _get_meta_path(track_id: str) -> Path:
    return META_DIR / f"{track_id}.json"


def _load_meta(track_id: str) -> dict | None:
    path = _get_meta_path(track_id)
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_meta(meta: dict):
    path = _get_meta_path(meta["id"])
    path.write_text(json.dumps(meta))


def _list_all_meta() -> list[dict]:
    results = []
    for f in META_DIR.glob("*.json"):
        results.append(json.loads(f.read_text()))
    return sorted(results, key=lambda x: x.get("uploaded_at", ""))


@router.get("")
async def list_tracks():
    return _list_all_meta()


@router.get("/{track_id}")
async def get_track(track_id: str):
    meta = _load_meta(track_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Track not found")
    return meta


@router.post("/upload")
async def upload_track(file: UploadFile):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    track_id = uuid.uuid4().hex[:12]
    dest = UPLOAD_DIR / f"{track_id}{ext}"

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large")

    dest.write_bytes(content)

    try:
        analysis = analyze_track(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Failed to analyze audio: {e}")

    from datetime import datetime, timezone

    meta = {
        "id": track_id,
        "filename": file.filename,
        "file_path": str(dest.relative_to(UPLOAD_DIR)),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        **analysis,
    }
    _save_meta(meta)
    return meta


@router.delete("/{track_id}")
async def delete_track(track_id: str):
    meta = _load_meta(track_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Track not found")

    audio_path = UPLOAD_DIR / meta["file_path"]
    audio_path.unlink(missing_ok=True)
    _get_meta_path(track_id).unlink(missing_ok=True)
    return {"deleted": track_id}
