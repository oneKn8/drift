import asyncio
import json

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.config import REDIS_URL

router = APIRouter()

connected_clients: set[WebSocket] = set()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await ws.send_json({"type": "pong"})
            else:
                await ws.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})
    except WebSocketDisconnect:
        connected_clients.discard(ws)
    except Exception:
        connected_clients.discard(ws)


async def broadcast(message: dict):
    """Send a message to all connected WebSocket clients."""
    disconnected = set()
    for ws in connected_clients:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.add(ws)
    connected_clients -= disconnected


async def redis_pipeline_listener() -> None:
    """Subscribe to Redis pipeline_progress channel and forward to WebSocket clients.

    Runs as a long-lived background task. On each message received from the
    Redis pub/sub channel, the payload is parsed as JSON and broadcast to
    all connected WebSocket clients.
    """
    redis_client = aioredis.from_url(REDIS_URL)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("pipeline_progress")
    logger.info("Redis pipeline listener started on channel 'pipeline_progress'")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await broadcast(data)
                except (json.JSONDecodeError, TypeError) as exc:
                    logger.warning(
                        "Failed to parse pipeline progress message: {}", exc
                    )
    except asyncio.CancelledError:
        logger.info("Redis pipeline listener shutting down")
    finally:
        await pubsub.unsubscribe("pipeline_progress")
        await redis_client.aclose()
