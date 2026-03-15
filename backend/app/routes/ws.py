import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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
    disconnected = set()
    for ws in connected_clients:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.add(ws)
    connected_clients -= disconnected
