from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import UPLOAD_DIR, ENHANCED_DIR, EXPORTS_DIR
from app.routes.library import router as library_router

app = FastAPI(title="Audio Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(library_router)

app.mount("/audio/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/audio/enhanced", StaticFiles(directory=str(ENHANCED_DIR)), name="enhanced")
app.mount("/audio/exports", StaticFiles(directory=str(EXPORTS_DIR)), name="exports")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
