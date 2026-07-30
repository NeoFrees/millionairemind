"""The compounding ladder — the progression model and the ratchet.

Ladder math: node n target equity = base * 2**n.
  base=$1 -> L1=$2, L2=$4, ... L20=$1,048,576.

The ratchet is the single most important capital-preservation mechanism here.
A naive doubling strategy is a martingale walk to ruin: it only takes one
total loss at any rung to end the run. Sweeping a fixed share of each level's
gains into a reserve that agents cannot touch converts paper gains into a
monotonically rising floor, so the worst case degrades from "zero" to "back
to the last locked floor."
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.models.schemas import LadderState


class LadderEngine:
    def __init__(
        self,
        base_unit: float = 1.0,
        nodes: int = 20,
        ratchet_pct: float = 0.20,
        starting_equity: float | None = None,
    ) -> None:
        if base_unit <= 0:
            raise ValueError("base_unit must be > 0")
        if not (0.0 <= ratchet_pct < 0.9):
            raise ValueError("ratchet_pct must be in [0, 0.9)")
        equity = starting_equity if starting_equity is not None else base_unit
        self.state = LadderState(
            base_unit=base_unit,
            nodes=nodes,
            current_node=0,
            equity=equity,
            peak_equity=equity,
            floor=0.0,
            reserve=0.0,
            level_start_equity=equity,
            level_peak_equity=equity,
            day_start_equity=equity,
            ratchet_pct=ratchet_pct,
        )

    # ── pure math ────────────────────────────────────────────────────────
    def node_target(self, n: int) -> float:
        return self.state.base_unit * (2**n)

    def node_targets(self) -> list[float]:
        return [self.node_target(n) for n in range(1, self.state.nodes + 1)]

    # ── state transitions ────────────────────────────────────────────────
    def set_equity(self, equity: float) -> list[dict]:
        """Mark equity to market and resolve any level-ups or regressions.

        Returns a list of events so callers can broadcast/animate them.
        Equity is total (realized + unrealized + reserve).
        """
        s = self.state
        s.equity = equity
        s.peak_equity = max(s.peak_equity, equity)
        s.level_peak_equity = max(s.level_peak_equity, equity)

        events: list[dict] = []
        # Level up, possibly several rungs in one tick on a violent move.
        while s.current_node < s.nodes and s.equity >= self.node_target(s.current_node + 1):
            events.append(self._level_up())
        # Regression: equity has fallen back below the floor locked at the
        # previous rung. Shown honestly in the UI, never hidden.
        while s.current_node > 0 and s.equity < self.node_target(s.current_node):
            events.append(self._regress())
        return events

    def _level_up(self) -> dict:
        s = self.state
        target = self.node_target(s.current_node + 1)
        gain = max(0.0, s.equity - s.level_start_equity)
        sweep = gain * s.ratchet_pct
        s.reserve += sweep
        s.current_node += 1
        s.levels_completed += 1
        # The floor is the reserve: capital agents provably cannot deploy.
        s.floor = s.reserve
        s.level_start_equity = s.equity
        s.level_peak_equity = s.equity
        ev = {
            "type": "level_up",
            "node": s.current_node,
            "target": target,
            "equity": s.equity,
            "swept_to_reserve": sweep,
            "reserve": s.reserve,
            "floor": s.floor,
            "next_target": s.next_target,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        s.history.append(ev)
        return ev

    def _regress(self) -> dict:
        s = self.state
        s.current_node -= 1
        s.regressions += 1
        s.level_start_equity = self.node_target(s.current_node) if s.current_node else s.base_unit
        s.level_peak_equity = s.equity
        ev = {
            "type": "regression",
            "node": s.current_node,
            "equity": s.equity,
            "reserve": s.reserve,
            "floor": s.floor,
            "next_target": s.next_target,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        s.history.append(ev)
        return ev

    def start_new_day(self) -> None:
        self.state.day_start_equity = self.state.equity

    def reset_drawdown_anchors(self) -> None:
        """Re-anchor both breakers to current equity.

        Called on a human re-arm. Without this the breach reading is still true
        on the very next tick, so the kill switch re-trips instantly and can
        never be cleared — the halt would be permanent by accident.
        """
        s = self.state
        s.day_start_equity = s.equity
        s.level_peak_equity = s.equity

    # ── drawdown readings, used by the Guardian ──────────────────────────
    def daily_drawdown_pct(self) -> float:
        d = self.state.day_start_equity
        return 0.0 if d <= 0 else max(0.0, (d - self.state.equity) / d)

    def level_drawdown_pct(self) -> float:
        p = self.state.level_peak_equity
        return 0.0 if p <= 0 else max(0.0, (p - self.state.equity) / p)
