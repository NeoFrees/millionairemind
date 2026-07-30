"""Coordinator — orchestrates the pipeline and owns the single source of truth.

Pipeline, in strict order, every tick:
    Scout -> Diligence -> Guardian -> (human gate if tier requires) -> Execution -> Monitor

Nothing skips a stage. The Guardian's verdict object is the only thing Execution
accepts, and the per-level RiskBudget is decremented here so a rung cannot
overspend even across many individually-compliant trades.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.adapters.mocks import AdapterRegistry
from app.agents.diligence import DiligenceAgent
from app.agents.execution import ExecutionAgent
from app.agents.guardian import GuardianAgent
from app.agents.monitor import MonitorAgent
from app.agents.scout import ScoutAgent
from app.agents.treasury import TreasuryAgent
from app.config import Settings
from app.core.audit import AuditLog
from app.core.bus import Broadcaster, MessageBus
from app.core.ladder import LadderEngine
from app.core.risk import KillSwitch, RiskEngine
from app.models.schemas import (
    ApprovalTicket,
    Candidate,
    InvestmentThesis,
    Order,
    PaymentRequest,
    Position,
    RiskBudget,
    RiskVerdict,
)

MAX_CONCURRENT_POSITIONS = 8
MAX_THESES_PER_TICK = 2


class Coordinator:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self.bus = MessageBus()
        self.broadcaster = Broadcaster()
        self.audit = AuditLog(settings.db_path)
        self.registry = AdapterRegistry(settings.sim_seed, settings.sim_vol_scale)

        self.ladder = LadderEngine(
            base_unit=settings.base_unit,
            nodes=settings.ladder_nodes,
            ratchet_pct=settings.ratchet_pct,
            starting_equity=settings.base_unit,
        )
        self.kill = KillSwitch()
        self.risk = RiskEngine(settings, self.kill)

        self.scout = ScoutAgent(self.bus, self.audit, self.registry)
        self.diligence = DiligenceAgent(
            self.bus, self.audit, self.registry, settings.kelly_fraction, settings.max_position_pct
        )
        self.guardian = GuardianAgent(self.bus, self.audit, self.risk)
        self.execution = ExecutionAgent(self.bus, self.audit, self.registry)
        self.monitor = MonitorAgent(
            self.bus, self.audit, self.registry, settings.max_position_pct
        )
        self.treasury = TreasuryAgent(self.bus, self.audit, self.registry, settings.autonomy_tier)

        # state — single source of truth
        self.candidates: list[Candidate] = []
        self.theses: dict[str, InvestmentThesis] = {}
        self.verdicts: dict[str, RiskVerdict] = {}
        self.positions: dict[str, Position] = {}
        self.orders: list[Order] = []
        self.payments: dict[str, PaymentRequest] = {}
        self.tickets: dict[str, ApprovalTicket] = {}
        self.equity_curve: list[dict] = []
        self.activity: list[dict] = []
        self.realized_pnl: float = 0.0
        self.cash_deployed: float = 0.0
        self.tick_count: int = 0
        self.budget = RiskBudget(
            node=0,
            level_start_equity=settings.base_unit,
            max_deployable_usd=settings.base_unit * settings.max_total_risk_pct,
        )
        self._running = False
        self._task: asyncio.Task | None = None
        self.bus.subscribe("*", self._record_activity)
        self._push_curve()

    # ── activity feed ────────────────────────────────────────────────────
    async def _record_activity(self, msg) -> None:
        self.activity.append(
            {"topic": msg.topic, "sender": msg.sender, "payload": msg.payload, "at": msg.at}
        )
        del self.activity[:-200]
        await self.broadcaster.send("activity", self.activity[-1])

    # ── equity accounting ────────────────────────────────────────────────
    def open_positions(self) -> list[Position]:
        return [p for p in self.positions.values() if p.status == "open"]

    def unrealized(self) -> float:
        return sum(p.unrealized_pnl for p in self.open_positions())

    def equity(self) -> float:
        """Total equity: base + realized + unrealized. Reserve is part of equity
        but excluded from `deployable`, which is what sizing uses."""
        return self.s.base_unit + self.realized_pnl + self.unrealized()

    def _push_curve(self) -> None:
        self.equity_curve.append(
            {
                "t": datetime.now(timezone.utc).isoformat(),
                "tick": self.tick_count,
                "equity": round(self.equity(), 6),
                "reserve": round(self.ladder.state.reserve, 6),
                "floor": round(self.ladder.state.floor, 6),
                "node": self.ladder.state.current_node,
            }
        )
        del self.equity_curve[:-720]

    # ── the pipeline ─────────────────────────────────────────────────────
    async def tick(self) -> dict:
        self.tick_count += 1
        self.registry.tick()
        events: list[dict] = []

        # 1. Monitor first: mark the existing book before deciding anything new.
        close_events = await self.monitor.mark_and_review(
            list(self.positions.values()), self.ladder.state.deployable
        )
        for ev in close_events:
            if ev["type"] == "closed":
                self.realized_pnl += ev["pnl"]
                self.budget.deployed_usd = max(0.0, self.budget.deployed_usd - self._size_of(ev))
                if ev["pnl"] < 0:
                    self.budget.realized_loss_usd += -ev["pnl"]
                # Retire the thesis with its position — a thesis whose trade is
                # closed is not "live", and the board should say so.
                pos = self.positions.get(ev.get("position_id", ""))
                if pos and pos.thesis_id in self.theses:
                    self.theses[pos.thesis_id].status = "closed"
        events += close_events

        # 2. Reconcile equity and resolve ladder transitions.
        ladder_events = self.ladder.set_equity(self.equity())
        for ev in ladder_events:
            if ev["type"] == "level_up":
                await self.treasury.sweep_to_reserve(ev["swept_to_reserve"])
                self._reset_budget()
                self.audit.write(
                    "coordinator",
                    "level_up",
                    None,
                    f"node {ev['node']} reached at ${ev['equity']:,.2f}; "
                    f"${ev['swept_to_reserve']:,.2f} ratcheted into reserve",
                    "info",
                    ev,
                )
            else:
                self.audit.write(
                    "coordinator",
                    "regression",
                    None,
                    f"stepped down to node {ev['node']} at ${ev['equity']:,.2f}",
                    "warn",
                    ev,
                )
            await self.broadcaster.send("ladder", ev)
        events += ladder_events

        # 3. Guardian sweeps the breakers independently of any thesis.
        daily_dd = self.ladder.daily_drawdown_pct()
        level_dd = self.ladder.level_drawdown_pct()
        events += [{"type": "breach", **b} for b in await self.guardian.sweep_breakers(daily_dd, level_dd)]

        # 4. New deployment — only if the system is armed and has room.
        if not self.kill.tripped and len(self.open_positions()) < MAX_CONCURRENT_POSITIONS:
            self.candidates = await self.scout.scan()
            held = {p.instrument for p in self.open_positions()}
            fresh = [c for c in self.candidates if c.instrument not in held][:MAX_THESES_PER_TICK]

            for c in fresh:
                thesis = await self.diligence.research(c)
                if thesis is None:
                    continue
                self.theses[thesis.id] = thesis

                verdict = await self.guardian.evaluate(
                    thesis,
                    self.ladder.state,
                    self.open_positions(),
                    c.liquidity_usd,
                    daily_dd,
                    level_dd,
                )
                self.verdicts[thesis.id] = verdict
                thesis.risk_verdict = verdict.decision
                thesis.risk_notes = [
                    f"{ch.name}: {'pass' if ch.passed else 'FAIL'} ({ch.actual:.4g} vs {ch.limit:.4g})"
                    for ch in verdict.checks
                ]
                thesis.approved_size_pct = verdict.approved_size_pct

                if verdict.decision == "rejected":
                    thesis.status = "rejected"
                    continue

                # Per-level budget: a rung cannot overspend even via compliant trades.
                if verdict.approved_size_usd > self.budget.remaining_usd:
                    thesis.status = "rejected"
                    thesis.risk_notes.append(
                        f"level_budget: FAIL (${verdict.approved_size_usd:,.2f} requested vs "
                        f"${self.budget.remaining_usd:,.2f} remaining on node {self.budget.node})"
                    )
                    self.audit.write(
                        "coordinator",
                        "budget_exhausted",
                        thesis.id,
                        "rejected — per-level risk budget exhausted",
                        "warn",
                    )
                    continue

                if verdict.decision == "needs_human":
                    thesis.status = "approved"
                    t = ApprovalTicket(
                        kind="trade",
                        thesis_id=thesis.id,
                        headline=f"{thesis.direction.upper()} {thesis.instrument} on {thesis.venue}",
                        size_usd=verdict.approved_size_usd,
                        edge_pct=thesis.expected_value_pct,
                        expected_value_pct=thesis.expected_value_pct,
                        risk_summary=(
                            f"{verdict.approved_size_pct:.2%} of deployable; stop "
                            f"{thesis.exit.stop:.6g}; kill: {thesis.kill_thesis[:120]}"
                        ),
                        checks=verdict.checks,
                    )
                    self.tickets[t.id] = t
                    await self.broadcaster.send("ticket", t.model_dump())
                    continue

                thesis.status = "approved"
                await self._fill(thesis, verdict)

        self._push_curve()
        await self.broadcaster.send("tick", self.snapshot_light())
        return {"tick": self.tick_count, "events": events}

    def _size_of(self, ev: dict) -> float:
        p = self.positions.get(ev.get("position_id", ""))
        return p.size_usd if p else 0.0

    async def _fill(self, thesis: InvestmentThesis, verdict: RiskVerdict) -> Order:
        order, pos = await self.execution.execute(thesis, verdict, paper=True)
        self.orders.append(order)
        del self.orders[:-300]
        if pos is not None:
            self.positions[pos.id] = pos
            self.budget.deployed_usd += pos.size_usd
            thesis.status = "live"
        return order

    def _reset_budget(self) -> None:
        st = self.ladder.state
        self.budget = RiskBudget(
            node=st.current_node,
            level_start_equity=st.level_start_equity,
            max_deployable_usd=st.deployable * self.s.max_total_risk_pct,
        )

    # ── human decisions ──────────────────────────────────────────────────
    async def decide_ticket(self, ticket_id: str, approve: bool) -> ApprovalTicket:
        t = self.tickets[ticket_id]
        t.status = "approved" if approve else "rejected"
        t.decided_at = datetime.now(timezone.utc).isoformat()
        self.audit.write(
            "human", f"ticket_{t.status}", t.id, t.headline, "info", {"ticket": t.model_dump()}
        )
        if approve and t.kind == "trade" and t.thesis_id:
            th, v = self.theses[t.thesis_id], self.verdicts[t.thesis_id]
            await self._fill(th, v)
        elif approve and t.kind == "payment" and t.payment_id:
            pr = self.payments[t.payment_id]
            pr.status = "approved"
            pr.decided_by = "human"
            await self.treasury.settle(pr)
        elif not approve and t.payment_id:
            self.payments[t.payment_id].status = "rejected"
        return t

    # ── lifecycle ────────────────────────────────────────────────────────
    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.audit.write(
            "coordinator",
            "started",
            None,
            f"tier={self.s.autonomy_tier} base=${self.s.base_unit} seed={self.s.sim_seed}",
        )
        self._task = asyncio.create_task(self._loop())

    async def _loop(self) -> None:
        while self._running:
            try:
                await self.tick()
            except Exception as e:  # a rogue tick must not end the run
                self.audit.write("coordinator", "tick_error", None, repr(e), "error")
            await asyncio.sleep(self.s.sim_tick_seconds)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
        self.audit.write("coordinator", "stopped", None, f"after {self.tick_count} ticks")

    # ── views ────────────────────────────────────────────────────────────
    def snapshot_light(self) -> dict:
        st = self.ladder.state
        return {
            "tick": self.tick_count,
            "equity": self.equity(),
            "node": st.current_node,
            "next_target": st.next_target,
            "progress_pct": st.progress_pct,
            "reserve": st.reserve,
            "floor": st.floor,
            "deployable": st.deployable,
            "realized_pnl": self.realized_pnl,
            "unrealized_pnl": self.unrealized(),
            "open_positions": len(self.open_positions()),
            "kill_tripped": self.kill.tripped,
            "running": self._running,
        }
