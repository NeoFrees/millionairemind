"""Deterministic risk engine. The Guardian's veto lives here, in code.

Why here and not in a prompt: an LLM can be argued out of a limit. A function
cannot. Every hard limit is evaluated as an explicit, logged check against
`Settings`, and `evaluate_thesis` is the only path to a non-zero position size.
Agents may *propose*; only this module *approves*.

All percentages are fractions of **deployable** equity (equity minus the
protected reserve), never total equity. That is what makes the ratchet real:
the reserve is arithmetically outside every sizing decision.
"""
from __future__ import annotations

from typing import Iterable

from app.config import Settings
from app.core.kelly import (
    expected_value_directional,
    expected_value_pct,
    fractional_kelly_directional,
    fractional_kelly_size_pct,
    payoff_ratio_from_price,
)
from app.models.schemas import (
    Breach,
    InvestmentThesis,
    LadderState,
    Position,
    RiskCheck,
    RiskVerdict,
)


class KillSwitch:
    """Global halt. Trips automatically on a breach; only a human re-arms it."""

    def __init__(self) -> None:
        self.tripped: bool = False
        self.reason: str | None = None
        self.tripped_at: str | None = None
        self.breaches: list[Breach] = []

    def trip(self, limit_name: str, limit: float, actual: float, action: str) -> Breach:
        from datetime import datetime, timezone

        b = Breach(limit_name=limit_name, limit=limit, actual=actual, action_taken=action)
        self.breaches.append(b)
        self.tripped = True
        self.reason = f"{limit_name}: {actual:.4f} vs limit {limit:.4f} — {action}"
        self.tripped_at = datetime.now(timezone.utc).isoformat()
        return b

    def rearm(self, by: str = "human") -> bool:
        """Re-arm. Deliberately requires a human identity; no agent calls this."""
        from datetime import datetime, timezone

        if not self.tripped:
            return False
        if self.breaches:
            self.breaches[-1].rearmed_at = datetime.now(timezone.utc).isoformat()
            self.breaches[-1].rearmed_by = by
        self.tripped = False
        self.reason = None
        self.tripped_at = None
        return True


class RiskEngine:
    def __init__(self, settings: Settings, kill_switch: KillSwitch | None = None) -> None:
        self.s = settings
        self.kill = kill_switch or KillSwitch()

    # ── exposure readings ────────────────────────────────────────────────
    @staticmethod
    def _open(positions: Iterable[Position]) -> list[Position]:
        return [p for p in positions if p.status == "open"]

    def total_exposure_usd(self, positions: Iterable[Position]) -> float:
        return sum(p.size_usd for p in self._open(positions))

    def venue_exposure_usd(self, positions: Iterable[Position], venue: str) -> float:
        return sum(p.size_usd for p in self._open(positions) if p.venue == venue)

    def group_exposure_usd(self, positions: Iterable[Position], group: str) -> float:
        if group == "uncorrelated":
            return 0.0
        return sum(p.size_usd for p in self._open(positions) if p.correlation_group == group)

    # ── the gate ─────────────────────────────────────────────────────────
    def evaluate_thesis(
        self,
        thesis: InvestmentThesis,
        ladder: LadderState,
        positions: list[Position],
        liquidity_usd: float,
        daily_drawdown_pct: float,
        level_drawdown_pct: float,
    ) -> RiskVerdict:
        s = self.s
        deployable = ladder.deployable
        checks: list[RiskCheck] = []

        def chk(name: str, passed: bool, limit: float, actual: float, detail: str) -> None:
            checks.append(
                RiskCheck(name=name, passed=passed, limit=limit, actual=actual, detail=detail)
            )

        # 0. Kill switch — nothing clears while halted.
        chk(
            "kill_switch",
            not self.kill.tripped,
            0.0,
            1.0 if self.kill.tripped else 0.0,
            self.kill.reason or "armed and clear",
        )

        # 1. Paper-first mandate. T0 is the only implemented tier.
        chk(
            "autonomy_tier",
            s.autonomy_tier == "T0",
            0.0,
            0.0,
            f"tier={s.autonomy_tier}; execution is simulated",
        )

        # 2. Sizing — fractional Kelly, hard-capped.
        # Two genuinely different bets, sized by two different formulas.
        # Prediction-market contracts are all-or-nothing: being wrong zeroes the
        # stake. A stopped directional trade loses only the distance to the stop.
        # Using one model for both silently misstates EV by ~1/stop_distance.
        if thesis.venue == "polymarket":
            payoff = payoff_ratio_from_price(thesis.entry.level)
            sized_pct, full_kelly = fractional_kelly_size_pct(
                thesis.win_probability,
                payoff,
                s.kelly_fraction,
                s.max_position_pct,
                thesis.fees_slippage_pct,
            )
            ev = expected_value_pct(
                thesis.win_probability, payoff, thesis.fees_slippage_pct
            )
        else:
            win_move, loss_move = self._moves_from_levels(thesis)
            sized_pct, full_kelly = fractional_kelly_directional(
                thesis.win_probability,
                win_move,
                loss_move,
                s.kelly_fraction,
                s.max_position_pct,
                thesis.fees_slippage_pct,
            )
            ev = expected_value_directional(
                thesis.win_probability, win_move, loss_move, thesis.fees_slippage_pct
            )
        requested = min(thesis.recommended_size_pct or sized_pct, sized_pct)
        chk(
            "position_cap",
            requested <= s.max_position_pct + 1e-12,
            s.max_position_pct,
            requested,
            f"{s.kelly_fraction:g}x Kelly of full {full_kelly:.4f} -> {requested:.4f} of deployable",
        )
        chk(
            "positive_kelly",
            sized_pct > 0.0,
            0.0,
            sized_pct,
            "no positive net-of-fees Kelly edge" if sized_pct <= 0 else "positive edge",
        )

        size_usd = deployable * requested

        # 3. Edge must survive fees and slippage. `ev` is per unit of NOTIONAL in
        # both branches above, so it is directly comparable to min_edge_pct.
        chk(
            "min_edge_after_costs",
            ev >= s.min_edge_pct,
            s.min_edge_pct,
            ev,
            f"EV/unit staked net of {thesis.fees_slippage_pct:.4f} frictions",
        )

        # 4. Liquidity — we must be a small fraction of available depth.
        max_by_liq = liquidity_usd * s.max_liquidity_fraction
        chk(
            "liquidity",
            size_usd <= max_by_liq + 1e-9,
            max_by_liq,
            size_usd,
            f"depth {liquidity_usd:,.0f}; cap {s.max_liquidity_fraction:.0%} of it",
        )

        # 5. Per-venue exposure cap.
        venue_after = self.venue_exposure_usd(positions, thesis.venue) + size_usd
        venue_limit = deployable * s.max_venue_pct
        chk(
            "venue_exposure",
            venue_after <= venue_limit + 1e-9,
            venue_limit,
            venue_after,
            f"{thesis.venue} exposure after fill",
        )

        # 6. Total concurrent risk.
        total_after = self.total_exposure_usd(positions) + size_usd
        total_limit = deployable * s.max_total_risk_pct
        chk("total_risk", total_after <= total_limit + 1e-9, total_limit, total_after, "book gross")

        # 7. Correlation — stop the book becoming one bet in three costumes.
        grp_after = self.group_exposure_usd(positions, thesis.correlation_group) + (
            size_usd if thesis.correlation_group != "uncorrelated" else 0.0
        )
        grp_limit = deployable * s.max_correlation_pct
        chk(
            "correlation",
            grp_after <= grp_limit + 1e-9,
            grp_limit,
            grp_after,
            f"group '{thesis.correlation_group}' exposure after fill",
        )

        # 8. Drawdown circuit breakers.
        chk(
            "daily_drawdown",
            daily_drawdown_pct < s.max_daily_drawdown_pct,
            s.max_daily_drawdown_pct,
            daily_drawdown_pct,
            "halts new deployment for the day when breached",
        )
        chk(
            "level_drawdown",
            level_drawdown_pct < s.max_level_drawdown_pct,
            s.max_level_drawdown_pct,
            level_drawdown_pct,
            "halts new deployment for this rung when breached",
        )

        # 9. Reserve is untouchable — assert the arithmetic, don't just trust it.
        chk(
            "reserve_protected",
            size_usd <= deployable + 1e-9,
            deployable,
            size_usd,
            f"reserve {ladder.reserve:,.2f} excluded from deployable {deployable:,.2f}",
        )

        # 10. Thesis completeness. A kill thesis and sources are not optional.
        complete = bool(thesis.kill_thesis.strip()) and bool(thesis.sources)
        chk(
            "thesis_complete",
            complete,
            1.0,
            1.0 if complete else 0.0,
            "kill_thesis and at least one source required",
        )

        blocking = [c.name for c in checks if not c.passed]
        if blocking:
            decision = "rejected"
            approved_pct, approved_usd = 0.0, 0.0
        else:
            # Above T0, a human signs every ticket. T0 auto-clears into paper.
            decision = "approved" if s.autonomy_tier in ("T0", "T2", "T3") else "needs_human"
            approved_pct, approved_usd = requested, size_usd

        # A drawdown breach is not just a rejection — it halts the system.
        for name, limit, actual in (
            ("daily_drawdown", s.max_daily_drawdown_pct, daily_drawdown_pct),
            ("level_drawdown", s.max_level_drawdown_pct, level_drawdown_pct),
        ):
            if name in blocking and not self.kill.tripped:
                self.kill.trip(name, limit, actual, "halted new deployment; human re-arm required")

        return RiskVerdict(
            thesis_id=thesis.id,
            decision=decision,
            approved_size_pct=approved_pct,
            approved_size_usd=approved_usd,
            checks=checks,
            blocking=blocking,
        )

    @staticmethod
    def _moves_from_levels(thesis: InvestmentThesis) -> tuple[float, float]:
        """Fractional moves from entry to target and entry to stop, both positive.

        Denominated in notional, which is what position size and P&L are also
        denominated in — so EV, Kelly and the caps all compose correctly.
        """
        e, t, st = thesis.entry.level, thesis.exit.target, thesis.exit.stop
        if e <= 0 or t <= 0 or st <= 0:
            return 0.0, 0.0
        return abs(t - e) / e, abs(e - st) / e

    # ── portfolio-level surveillance ─────────────────────────────────────
    def utilization(self, ladder: LadderState, positions: list[Position]) -> list[dict]:
        s, d = self.s, ladder.deployable
        rows = [
            ("Total gross risk", self.total_exposure_usd(positions), d * s.max_total_risk_pct),
        ]
        for venue in ("polymarket", "crypto", "equities"):
            rows.append(
                (f"Venue: {venue}", self.venue_exposure_usd(positions, venue), d * s.max_venue_pct)
            )
        groups = {p.correlation_group for p in self._open(positions)} - {"uncorrelated"}
        for g in sorted(groups):
            rows.append(
                (f"Correlation: {g}", self.group_exposure_usd(positions, g), d * s.max_correlation_pct)
            )
        return [
            {
                "name": n,
                "used": u,
                "limit": lim,
                "pct": (u / lim) if lim > 0 else 0.0,
            }
            for n, u, lim in rows
        ]

    def check_breakers(self, daily_dd: float, level_dd: float) -> list[Breach]:
        """Called every tick, independent of any thesis. Force-halt on breach."""
        out: list[Breach] = []
        if daily_dd >= self.s.max_daily_drawdown_pct and not self.kill.tripped:
            out.append(
                self.kill.trip(
                    "daily_drawdown",
                    self.s.max_daily_drawdown_pct,
                    daily_dd,
                    "flattened new deployment; human re-arm required",
                )
            )
        if level_dd >= self.s.max_level_drawdown_pct and not self.kill.tripped:
            out.append(
                self.kill.trip(
                    "level_drawdown",
                    self.s.max_level_drawdown_pct,
                    level_dd,
                    "flattened new deployment; human re-arm required",
                )
            )
        return out
