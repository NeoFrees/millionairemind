"""Diligence — turns a candidate into an InvestmentThesis or kills it.

This is the research gate. The output object must be complete enough that a
human can read it, disagree with it, and know exactly what would prove it
wrong. A thesis with no kill condition and no sources is rejected by the risk
engine's `thesis_complete` check — deliberately, so incomplete research can
never reach capital.

In a live build the body of `research` is an LLM call with web-search and
market-data MCP tools; the schema it must fill is unchanged.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.adapters.mocks import AdapterRegistry
from app.agents.base import Agent
from app.core.kelly import (
    expected_value_directional,
    expected_value_pct,
    fractional_kelly_directional,
    fractional_kelly_size_pct,
    payoff_ratio_from_price,
)
from app.models.schemas import Candidate, Entry, Exit, InvestmentThesis

_GROUPS = {
    "BTC-PERP": "btc_beta",
    "BTC-SPOT": "btc_beta",
    "BTC-PERP/BTC-SPOT": "btc_basis",
    "ETH-PERP": "crypto_beta",
    "SOL-PERP": "crypto_beta",
    "SPY": "us_equity_beta",
    "QQQ": "us_equity_beta",
    "IWM": "us_equity_beta",
    "XLE": "energy",
    "FED-CUT-SEP": "us_rates",
    "GDP-BEAT-Q3": "us_macro",
    "ETF-APPROVAL-Q4": "crypto_regulatory",
    "ELECTION-TURNOUT-HI": "us_politics",
}

_SOURCE_HINTS = {
    "polymarket": [
        "https://polymarket.com/",
        "https://docs.polymarket.com/developers/CLOB/introduction",
    ],
    "crypto": [
        "https://www.coingecko.com/",
        "https://docs.ccxt.com/",
    ],
    "equities": [
        "https://www.sec.gov/edgar/search/",
        "https://alpaca.markets/docs/api-references/market-data-api/",
    ],
}


class DiligenceAgent(Agent):
    name = "diligence"
    mandate = "Produce a complete, falsifiable investment thesis or reject the candidate."

    def __init__(self, bus, audit, registry: AdapterRegistry, kelly_fraction: float,
                 max_position_pct: float) -> None:
        super().__init__(bus, audit)
        self.reg = registry
        self.kelly_fraction = kelly_fraction
        self.max_position_pct = max_position_pct

    async def research(self, c: Candidate) -> InvestmentThesis | None:
        adapter = self.reg.venue(c.venue)
        primary = c.instrument.split("/")[0]
        q = adapter.quote(primary)

        fees = self._friction_estimate(c, q.spread_pct)
        p, basis = self._probability(c, q)

        if c.venue == "polymarket":
            # All-or-nothing contract: being wrong zeroes the stake.
            entry_level = q.ask if c.direction == "yes" else 1.0 - q.bid
            payoff = payoff_ratio_from_price(entry_level)
            target, stop = (1.0, max(0.01, entry_level * 0.55))
            ev = expected_value_pct(p, payoff, fees)
            size_pct, full_kelly = fractional_kelly_size_pct(
                p, payoff, self.kelly_fraction, self.max_position_pct, fees
            )
        else:
            # Stopped directional trade: being wrong costs the distance to the
            # stop, not the notional. EV and Kelly must be denominated in
            # notional to be comparable to size, P&L and the min-edge gate.
            entry_level = q.mid
            win_move = max(c.raw_edge_pct, 0.004)
            loss_move = win_move * 0.6
            if c.direction in ("long", "yes"):
                target, stop = entry_level * (1 + win_move), entry_level * (1 - loss_move)
            else:
                target, stop = entry_level * (1 - win_move), entry_level * (1 + loss_move)
            payoff = win_move / loss_move
            ev = expected_value_directional(p, win_move, loss_move, fees)
            size_pct, full_kelly = fractional_kelly_directional(
                p, win_move, loss_move, self.kelly_fraction, self.max_position_pct, fees
            )

        if ev <= 0 or size_pct <= 0:
            self.log(
                "thesis_rejected",
                c.id,
                f"{c.instrument}: EV {ev:+.4f}, sized {size_pct:.4f} — no edge after costs",
                "info",
                {"candidate": c.model_dump()},
            )
            await self.emit("thesis.rejected", {"candidate_id": c.id, "reason": "no_edge"})
            return None

        horizon = {"high": 2, "medium": 10, "low": 45}[c.time_sensitivity]
        t = InvestmentThesis(
            venue=c.venue,
            instrument=c.instrument,
            direction=c.direction,
            edge_type=c.edge_type,
            thesis=self._narrative(c, q, p, ev, fees),
            expected_value_pct=ev,
            win_probability=p,
            probability_basis=basis,
            entry=Entry(
                level=round(entry_level, 6),
                conditions=(
                    f"Enter only while quoted spread <= {q.spread_pct * 2:.4%} and depth "
                    f">= ${c.liquidity_usd * 0.5:,.0f}. Do not chase past {entry_level * 1.01:.6g}."
                ),
            ),
            exit=Exit(
                target=round(target, 6),
                stop=round(stop, 6),
                time_stop=(datetime.now(timezone.utc) + timedelta(days=horizon)).isoformat(),
            ),
            fees_slippage_pct=fees,
            liquidity_note=(
                f"Top-of-book depth ${c.liquidity_usd:,.0f}; modelled slippage "
                f"{fees:.3%} inclusive of spread crossing and impact."
            ),
            recommended_size_pct=size_pct,
            kelly_fraction=full_kelly,
            correlation_group=_GROUPS.get(c.instrument, "uncorrelated"),
            correlation_note=(
                f"Bucketed as '{_GROUPS.get(c.instrument, 'uncorrelated')}'. Guardian caps "
                "aggregate exposure per bucket so the book cannot become one bet."
            ),
            kill_thesis=self._kill(c, entry_level, stop),
            sources=_SOURCE_HINTS.get(c.venue, []),
            confidence=self._confidence(c, ev),
            status="under_review",
            created_by=self.name,
        )
        self.log(
            "thesis_created",
            t.id,
            f"{t.instrument} {t.direction} EV {ev:+.2%} size {size_pct:.2%}",
            "info",
            {"thesis": t.model_dump()},
        )
        await self.emit("thesis.created", {"thesis_id": t.id, "instrument": t.instrument})
        return t

    # ── components ──────────────────────────────────────────────────────
    def _friction_estimate(self, c: Candidate, spread_pct: float) -> float:
        venue_fee = {"polymarket": 0.02, "crypto": 0.0006, "equities": 0.0002}[c.venue]
        return venue_fee + spread_pct / 2

    def _probability(self, c: Candidate, q) -> tuple[float, str]:
        if c.venue == "polymarket":
            latent = self.reg.polymarket.latent_probability(c.instrument)
            p = latent if c.direction == "yes" else 1.0 - latent
            return (
                min(0.97, max(0.03, p)),
                (
                    f"Independent estimate {latent:.1%} for YES, derived from the modelled "
                    f"base rate for this event class, vs. market mid {q.mid:.1%}. "
                    "In production this is an LLM-authored estimate citing primary sources; "
                    "here it is the simulator's latent value, which is honest about being synthetic."
                ),
            )
        if c.edge_type == "arbitrage":
            return 0.82, (
                "Convergence trade. Base rate for basis closure inside the horizon is high; "
                f"observed dislocation {c.raw_edge_pct:.3%} exceeds round-trip cost."
            )
        if c.edge_type == "funding":
            return 0.68, (
                f"Carry trade. {c.note}. Persistence of one-sided funding over the holding "
                "period is the assumption being paid for."
            )
        return 0.58, (
            f"Mean-reversion. {c.note}. Reversion within the horizon is the modelled edge; "
            "trend continuation is the failure mode."
        )

    def _narrative(self, c: Candidate, q, p: float, ev: float, fees: float) -> str:
        return (
            f"{c.instrument} is dislocated: {c.note}. We take the {c.direction.upper()} side at "
            f"{q.mid:.6g} because our independent estimate puts the win probability at "
            f"{p:.1%} against what the book is paying. Net of {fees:.2%} in fees and modelled "
            f"slippage the expected value is {ev:+.2%} per unit staked, which clears the "
            f"minimum-edge gate rather than merely looking attractive gross. The book has "
            f"${c.liquidity_usd:,.0f} of depth, so our size is a small fraction of it and the "
            f"edge survives the fill. Time sensitivity is {c.time_sensitivity}: the "
            "dislocation is the reason to act, and it is the first thing that will disappear."
        )

    def _kill(self, c: Candidate, entry: float, stop: float) -> str:
        if c.venue == "polymarket":
            return (
                f"Exit immediately if the contract trades through {stop:.3f}, if new information "
                "moves our independent probability estimate to within 2 points of the market "
                "price (the edge is gone, not merely smaller), or if the event resolves on a "
                "technicality outside the modelled base rate. Do not average down."
            )
        if c.edge_type == "arbitrage":
            return (
                f"Exit if the basis widens through {stop:.6g} rather than converging, if either "
                "leg's depth halves, or if funding flips such that the carry on the hedge exceeds "
                "the convergence gain. A widening 'arb' is a signal we mispriced the leg, not an "
                "invitation to add."
            )
        if c.edge_type == "funding":
            return (
                "Exit if funding normalises below 15% annualised (the carry no longer pays for "
                f"the directional risk), or if price moves through {stop:.6g}, meaning the "
                "directional loss is outrunning the carry collected."
            )
        return (
            f"Exit if price closes through {stop:.6g}, which would indicate this is a trend and "
            "not a deviation, or if the deviation persists past the time stop without reverting — "
            "a stale mean-reversion signal is a failed one."
        )

    def _confidence(self, c: Candidate, ev: float) -> str:
        if c.edge_type == "arbitrage" and ev > 0.05:
            return "high"
        if ev > 0.10 and c.liquidity_usd > 200_000:
            return "high"
        if ev > 0.04:
            return "medium"
        return "low"
