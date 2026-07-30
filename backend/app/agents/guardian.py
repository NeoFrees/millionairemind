"""Guardian — always-on, veto power, cannot be overridden by any agent.

This class is a thin, logging wrapper around `app.core.risk.RiskEngine`. All the
actual decisions are deterministic functions. That separation is the whole
point: there is no prompt, no reasoning step, and no negotiation surface between
a thesis and a limit.
"""
from __future__ import annotations

from app.agents.base import Agent
from app.core.risk import RiskEngine
from app.models.schemas import InvestmentThesis, LadderState, Position, RiskVerdict


class GuardianAgent(Agent):
    name = "guardian"
    mandate = "Enforce every hard limit before execution. Veto is absolute."

    def __init__(self, bus, audit, engine: RiskEngine) -> None:
        super().__init__(bus, audit)
        self.engine = engine

    async def evaluate(
        self,
        thesis: InvestmentThesis,
        ladder: LadderState,
        positions: list[Position],
        liquidity_usd: float,
        daily_dd: float,
        level_dd: float,
    ) -> RiskVerdict:
        v = self.engine.evaluate_thesis(
            thesis, ladder, positions, liquidity_usd, daily_dd, level_dd
        )
        self.log(
            f"verdict_{v.decision}",
            thesis.id,
            (
                f"{thesis.instrument}: {v.decision}"
                + (f" — blocked by {', '.join(v.blocking)}" if v.blocking else
                   f" at {v.approved_size_pct:.2%} (${v.approved_size_usd:,.2f})")
            ),
            "warn" if v.decision == "rejected" else "info",
            {"verdict": v.model_dump()},
        )
        await self.emit(f"risk.{v.decision}", {"thesis_id": thesis.id, "size": v.approved_size_usd})
        return v

    async def sweep_breakers(self, daily_dd: float, level_dd: float) -> list[dict]:
        breaches = self.engine.check_breakers(daily_dd, level_dd)
        out = []
        for b in breaches:
            self.log(
                "breaker_tripped",
                b.id,
                f"{b.limit_name} {b.actual:.2%} >= {b.limit:.2%} — {b.action_taken}",
                "critical",
                {"breach": b.model_dump()},
            )
            await self.emit("risk.halted", b.model_dump())
            out.append(b.model_dump())
        return out

    async def manual_kill(self, by: str = "human") -> dict:
        b = self.engine.kill.trip("manual_kill_switch", 0.0, 1.0, f"halted by {by}")
        self.log("kill_switch_engaged", b.id, f"manual halt by {by}", "critical")
        await self.emit("risk.halted", b.model_dump())
        return b.model_dump()

    async def rearm(self, by: str = "human") -> bool:
        ok = self.engine.kill.rearm(by)
        self.log(
            "kill_switch_rearmed" if ok else "rearm_noop",
            None,
            f"re-armed by {by}" if ok else "kill switch was not tripped",
            "warn",
        )
        if ok:
            await self.emit("risk.rearmed", {"by": by})
        return ok
