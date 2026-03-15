import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

from app.config import UPLOAD_DIR, ENHANCED_DIR, EXPORTS_DIR
from app.routes.library import router as library_router
from app.routes.pipeline import router as pipeline_router
from app.routes.ws import redis_pipeline_listener, router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: start/stop background tasks."""
    listener_task = asyncio.create_task(redis_pipeline_listener())
    logger.info("Pipeline progress listener started")
    yield
    listener_task.cancel()
    try:
        await listener_task
    except asyncio.CancelledError:
        pass
    logger.info("Pipeline progress listener stopped")


app = FastAPI(title="Audio Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(library_router)
app.include_router(pipeline_router)
app.include_router(ws_router)

app.mount("/audio/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/audio/enhanced", StaticFiles(directory=str(ENHANCED_DIR)), name="enhanced")
app.mount("/audio/exports", StaticFiles(directory=str(EXPORTS_DIR)), name="exports")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
