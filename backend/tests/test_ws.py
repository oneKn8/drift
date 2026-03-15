from starlette.testclient import TestClient
from app.main import app


def test_websocket_connects():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "ping"})
        data = ws.receive_json()
        assert data["type"] == "pong"


def test_websocket_invalid_message():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "unknown_garbage"})
        data = ws.receive_json()
        assert data["type"] == "error"
