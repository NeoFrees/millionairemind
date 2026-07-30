"""Execution — routes approved tickets to a venue adapter. Never self-approves.

The signature enforces the invariant: you cannot call `execute` without handing
over a RiskVerdict, and the first thing it does is refuse anything not approved.
"""
from __future__ import annotations

from app.adapters.base import LiveTradingDisabled
from app.adapters.mocks import AdapterRegistry
from app.agents.base import Agent
from app.models.schemas import InvestmentThesis, Order, Position, RiskVerdict


class ExecutionAgent(Agent):
    name = "execution"
    mandate = "Convert a risk-cleared ticket into fills. No approval authority."

    def __init__(self, bus, audit, registry: AdapterRegistry) -> None:
        super().__init__(bus, audit)
        self.reg = registry

    async def execute(
        self, thesis: InvestmentThesis, verdict: RiskVerdict, paper: bool = True
    ) -> tuple[Order, Position | None]:
        order = Order(
            thesis_id=thesis.id,
            venue=thesis.venue,
            instrument=thesis.instrument,
            direction=thesis.direction,
            size_usd=verdict.approved_size_usd,
            order_type="limit",
            limit_price=thesis.entry.level,
            paper=paper,
        )

        if verdict.decision != "approved":
            order.status = "rejected"
            order.reject_reason = f"verdict={verdict.decision}; blocking={verdict.blocking}"
            self.log("order_refused", order.id, order.reject_reason, "warn")
            return order, None

        if verdict.approved_size_usd <= 0:
            order.status = "rejected"
            order.reject_reason = "approved size is zero"
            self.log("order_refused", order.id, order.reject_reason, "warn")
            return order, None

        adapter = self.reg.venue(thesis.venue)
        primary = thesis.instrument.split("/")[0]
        try:
            fill = adapter.place_order(primary, thesis.direction, verdict.approved_size_usd, paper)
        except LiveTradingDisabled as e:
            order.status = "rejected"
            order.reject_reason = str(e)
            self.log("order_refused_live_disabled", order.id, str(e), "critical")
            await self.emit("execution.refused", {"order_id": order.id, "reason": str(e)})
            return order, None

        # Slippage guard: if the actual fill ate the edge, we do not keep the trade.
        if fill.slippage_pct > thesis.fees_slippage_pct * 2.5:
            order.status = "cancelled"
            order.reject_reason = (
                f"slippage {fill.slippage_pct:.3%} exceeded 2.5x modelled "
                f"{thesis.fees_slippage_pct:.3%} — edge no longer present"
            )
            self.log("order_cancelled_slippage", order.id, order.reject_reason, "warn")
            return order, None

        order.status = "filled"
        order.filled_size_usd = verdict.approved_size_usd
        order.avg_fill_price = fill.price
        order.slippage_pct = fill.slippage_pct

        pos = Position(
            thesis_id=thesis.id,
            venue=thesis.venue,
            instrument=thesis.instrument,
            direction=thesis.direction,
            correlation_group=thesis.correlation_group,
            size_usd=verdict.approved_size_usd,
            deployable_at_entry=(
                verdict.approved_size_usd / verdict.approved_size_pct
                if verdict.approved_size_pct > 0
                else 0.0
            ),
            entry_price=fill.price,
            mark_price=fill.price,
            stop=thesis.exit.stop,
            target=thesis.exit.target,
            time_stop=thesis.exit.time_stop,
            kill_thesis=thesis.kill_thesis,
        )
        self.log(
            "order_filled",
            order.id,
            f"{thesis.instrument} {thesis.direction} ${order.filled_size_usd:,.2f} "
            f"@ {fill.price:.6g} (slip {fill.slippage_pct:.3%}){' [PAPER]' if paper else ''}",
            "info",
            {"order": order.model_dump(), "position_id": pos.id},
        )
        await self.emit("execution.filled", {"order_id": order.id, "position_id": pos.id})
        return order, pos
