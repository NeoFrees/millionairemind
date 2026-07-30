"""Agent base. Narrow mandate, structured I/O, everything logged.

Agents in this build are deterministic/heuristic stand-ins for LLM agents. The
seam is intentional: each `handle` method takes structured input and returns
structured output, so swapping the body for an LLM call over MCP tools changes
nothing about the pipeline, the audit trail, or — critically — the risk gate.
"""
from __future__ import annotations

from abc import ABC
from typing import Any

from app.core.audit import AuditLog
from app.core.bus import MessageBus


class Agent(ABC):
    name: str = "agent"
    mandate: str = ""

    def __init__(self, bus: MessageBus, audit: AuditLog) -> None:
        self.bus = bus
        self.audit = audit

    def log(
        self,
        action: str,
        subject: str | None = None,
        detail: str = "",
        severity: str = "info",
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.audit.write(self.name, action, subject, detail, severity, payload)

    async def emit(self, topic: str, payload: dict[str, Any]) -> None:
        await self.bus.publish(topic, payload, sender=self.name)
