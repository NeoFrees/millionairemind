"""Minimal async message bus + broadcast hub.

Agents never call each other directly. They publish typed messages and the
Coordinator subscribes, which keeps every hand-off auditable and makes it
possible to replay a decision trail exactly.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable


@dataclass(slots=True)
class Message:
    topic: str
    payload: dict[str, Any]
    sender: str = "system"
    at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


Handler = Callable[[Message], Awaitable[None]]


class MessageBus:
    def __init__(self, history_limit: int = 500) -> None:
        self._subs: dict[str, list[Handler]] = defaultdict(list)
        self.history: list[Message] = []
        self._limit = history_limit

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._subs[topic].append(handler)

    async def publish(self, topic: str, payload: dict[str, Any], sender: str = "system") -> Message:
        msg = Message(topic=topic, payload=payload, sender=sender)
        self.history.append(msg)
        if len(self.history) > self._limit:
            del self.history[: len(self.history) - self._limit]
        handlers = list(self._subs.get(topic, ())) + list(self._subs.get("*", ()))
        if handlers:
            await asyncio.gather(*(h(msg) for h in handlers), return_exceptions=True)
        return msg


class Broadcaster:
    """Fan-out to connected WebSocket clients. Slow clients are dropped, not queued."""

    def __init__(self) -> None:
        self._clients: set[Any] = set()

    def add(self, ws: Any) -> None:
        self._clients.add(ws)

    def remove(self, ws: Any) -> None:
        self._clients.discard(ws)

    async def send(self, event: str, data: Any) -> None:
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json({"event": event, "data": data})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.remove(ws)
