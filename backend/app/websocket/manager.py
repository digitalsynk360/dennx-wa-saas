"""
WebSocket connection manager with Redis pub/sub fan-out.

With multiple uvicorn workers (and later multiple backend instances),
a webhook handled by worker A must reach a Next.js client connected
to worker B. Each worker subscribes to `ws:{workspace_id}`; one
publish delivers to every connected browser across all workers.
"""
import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket

from app.core.logging import get_logger
from app.core.redis import redis_client

logger = get_logger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._listener_task: asyncio.Task | None = None

    async def connect(self, workspace_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[workspace_id].add(websocket)
        if self._listener_task is None or self._listener_task.done():
            self._listener_task = asyncio.create_task(self._listen())
        logger.info("ws_connected", workspace_id=workspace_id)

    def disconnect(self, workspace_id: str, websocket: WebSocket) -> None:
        self._connections[workspace_id].discard(websocket)
        if not self._connections[workspace_id]:
            del self._connections[workspace_id]

    async def broadcast(self, workspace_id: str, event: str, data: dict) -> None:
        await redis_client.publish(
            f"ws:{workspace_id}", json.dumps({"event": event, "data": data})
        )

    async def _listen(self) -> None:
        pubsub = redis_client.pubsub()
        await pubsub.psubscribe("ws:*")
        try:
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                workspace_id = message["channel"].split(":", 1)[1]
                sockets = list(self._connections.get(workspace_id, ()))
                dead: list[WebSocket] = []
                for ws in sockets:
                    try:
                        await ws.send_text(message["data"])
                    except Exception:
                        dead.append(ws)
                for ws in dead:
                    self.disconnect(workspace_id, ws)
        finally:
            await pubsub.aclose()


manager = ConnectionManager()
