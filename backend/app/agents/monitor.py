"""Monitor — position and portfolio surveillance.

Its most important job is not P&L; it is asking, every tick, whether each
position's *kill thesis* is triggering. A position whose reason for existing has
evaporated is a liability even while it is green.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.adapters.mocks import AdapterRegistry
from app.agents.base import Agent
from app.models.schemas import Position


class MonitorAgent(Agent):
    name = "monitor"
    mandate = "Mark positions, test kill theses, escalate degraded trades."

    # Flag when a position's share of a shrunken book drifts this far past
    # its entry-time cap. Informational: we do not force-liquidate on drift.
    DRIFT_TOLERANCE = 1.25

    def __init__(self, bus, audit, registry: AdapterRegistry, max_position_pct: float = 1.0) -> None:
        super().__init__(bus, audit)
        self.reg = registry
        self.max_position_pct = max_position_pct

    async def mark_and_review(
        self, positions: list[Position], deployable: float | None = None
    ) -> list[dict]:
        """Mark to market, compute kill proximity, close what must close."""
        events: list[dict] = []
        now = datetime.now(timezone.utc)

        for p in positions:
            if p.status != "open":
                continue
            adapter = self.reg.venue(p.venue)
            p.mark_price = adapter.quote(p.instrument.split("/")[0]).mid
            p.kill_proximity = self._kill_proximity(p)

            reason = None
            if self._stop_hit(p):
                reason = f"stop {p.stop:.6g} breached at {p.mark_price:.6g}"
            elif self._target_hit(p):
                reason = f"target {p.target:.6g} reached at {p.mark_price:.6g}"
            elif p.time_stop and now >= datetime.fromisoformat(p.time_stop):
                reason = "time stop elapsed — thesis had a horizon and it expired"

            if reason:
                events.append(await self._close(p, reason))
            elif deployable and deployable > 0 and (
                p.size_usd / deployable
            ) > self.max_position_pct * self.DRIFT_TOLERANCE:
                self.log(
                    "position_cap_drift",
                    p.id,
                    f"{p.instrument} is {p.size_usd / deployable:.2%} of a shrunken book "
                    f"(cap {self.max_position_pct:.2%}, entered at {p.size_pct_at_entry:.2%}) — "
                    "within the rules, but concentration is rising as equity falls",
                    "warn",
                )
                events.append({"type": "cap_drift", "position_id": p.id, "instrument": p.instrument})
            elif p.kill_proximity >= 0.8:
                self.log(
                    "thesis_degraded",
                    p.id,
                    f"{p.instrument} kill-thesis proximity {p.kill_proximity:.0%} — escalating",
                    "warn",
                )
                await self.emit(
                    "monitor.degraded", {"position_id": p.id, "proximity": p.kill_proximity}
                )
                events.append({"type": "degraded", "position_id": p.id, "instrument": p.instrument})
        return events

    async def _close(self, p: Position, reason: str) -> dict:
        p.realized_pnl = p.unrealized_pnl
        p.status = "closed"
        p.closed_at = datetime.now(timezone.utc).isoformat()
        p.kill_proximity = 0.0
        self.log(
            "position_closed",
            p.id,
            f"{p.instrument} closed: {reason} | realized {p.realized_pnl:+,.2f}",
            "info" if p.realized_pnl >= 0 else "warn",
            {"position": p.model_dump()},
        )
        await self.emit(
            "monitor.closed",
            {"position_id": p.id, "pnl": p.realized_pnl, "reason": reason},
        )
        return {
            "type": "closed",
            "position_id": p.id,
            "instrument": p.instrument,
            "pnl": p.realized_pnl,
            "reason": reason,
        }

    @staticmethod
    def _stop_hit(p: Position) -> bool:
        if p.stop <= 0:
            return False
        return p.mark_price <= p.stop if p.direction in ("long", "yes") else p.mark_price >= p.stop

    @staticmethod
    def _target_hit(p: Position) -> bool:
        if p.target <= 0:
            return False
        return (
            p.mark_price >= p.target if p.direction in ("long", "yes") else p.mark_price <= p.target
        )

    @staticmethod
    def _kill_proximity(p: Position) -> float:
        """0 = healthy, 1 = kill thesis triggered. Measures distance travelled
        from entry toward the stop, which is where the thesis is falsified."""
        if p.stop <= 0 or p.entry_price <= 0:
            return 0.0
        span = abs(p.entry_price - p.stop)
        if span <= 0:
            return 0.0
        if p.direction in ("long", "yes"):
            travelled = p.entry_price - p.mark_price
        else:
            travelled = p.mark_price - p.entry_price
        return max(0.0, min(1.0, travelled / span))
