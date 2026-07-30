"""Risk-core tests. These are the tests that matter: if the Guardian is wrong,
nothing else in the platform is worth anything."""
import pytest

from app.config import Settings
from app.core.risk import KillSwitch, RiskEngine
from app.models.schemas import Entry, Exit, InvestmentThesis, LadderState, Position


def settings(**over) -> Settings:
    base = dict(
        base_unit=1000.0,
        kelly_fraction=0.25,
        max_position_pct=0.10,
        max_venue_pct=0.35,
        max_total_risk_pct=0.50,
        max_correlation_pct=0.20,
        max_daily_drawdown_pct=0.10,
        max_level_drawdown_pct=0.25,
        min_edge_pct=0.02,
        max_liquidity_fraction=0.10,
        autonomy_tier="T0",
    )
    base.update(over)
    return Settings(**base)


def ladder(equity=1000.0, reserve=0.0) -> LadderState:
    return LadderState(
        base_unit=1000.0,
        nodes=20,
        equity=equity,
        peak_equity=equity,
        reserve=reserve,
        floor=reserve,
        level_start_equity=equity,
        level_peak_equity=equity,
        day_start_equity=equity,
    )


def good_thesis(**over) -> InvestmentThesis:
    d = dict(
        venue="polymarket",
        instrument="FED-CUT-SEP",
        direction="yes",
        thesis="mispriced",
        edge_type="mispricing",
        win_probability=0.70,
        entry=Entry(level=0.50),
        exit=Exit(target=1.0, stop=0.30),
        fees_slippage_pct=0.02,
        recommended_size_pct=0.05,
        kill_thesis="exit below 0.30",
        sources=["https://polymarket.com/"],
        correlation_group="us_rates",
    )
    d.update(over)
    return InvestmentThesis(**d)


def evaluate(engine, thesis, l=None, positions=None, liq=1_000_000.0, ddd=0.0, ldd=0.0):
    return engine.evaluate_thesis(
        thesis, l or ladder(), positions or [], liq, ddd, ldd
    )


def position(size, venue="polymarket", group="uncorrelated") -> Position:
    return Position(
        thesis_id="x",
        venue=venue,
        instrument="X",
        direction="yes",
        correlation_group=group,
        size_usd=size,
        entry_price=0.5,
        mark_price=0.5,
    )


# ── happy path ───────────────────────────────────────────────────────────
def test_clean_thesis_is_approved():
    e = RiskEngine(settings())
    v = evaluate(e, good_thesis())
    assert v.decision == "approved", v.blocking
    assert v.approved_size_usd > 0
    assert all(c.passed for c in v.checks)


def test_every_check_is_recorded_even_when_passing():
    v = evaluate(RiskEngine(settings()), good_thesis())
    names = {c.name for c in v.checks}
    for expected in (
        "kill_switch",
        "autonomy_tier",
        "position_cap",
        "positive_kelly",
        "min_edge_after_costs",
        "liquidity",
        "venue_exposure",
        "total_risk",
        "correlation",
        "daily_drawdown",
        "level_drawdown",
        "reserve_protected",
        "thesis_complete",
    ):
        assert expected in names


# ── each limit must actually block ───────────────────────────────────────
def test_kill_switch_blocks_everything():
    ks = KillSwitch()
    ks.trip("manual", 0, 1, "halt")
    e = RiskEngine(settings(), ks)
    v = evaluate(e, good_thesis())
    assert v.decision == "rejected"
    assert "kill_switch" in v.blocking
    assert v.approved_size_usd == 0.0


def test_position_cap_binds_and_is_never_exceeded():
    e = RiskEngine(settings(max_position_pct=0.02))
    v = evaluate(e, good_thesis(recommended_size_pct=0.50))
    assert v.approved_size_pct <= 0.02 + 1e-12


def test_agent_cannot_request_more_than_kelly_allows():
    """An agent asking for 90% gets Kelly-and-cap sized, not what it asked for."""
    e = RiskEngine(settings())
    v = evaluate(e, good_thesis(recommended_size_pct=0.90))
    assert v.approved_size_pct <= 0.10


def test_no_edge_after_costs_is_rejected():
    e = RiskEngine(settings())
    v = evaluate(e, good_thesis(win_probability=0.50, fees_slippage_pct=0.15))
    assert v.decision == "rejected"
    assert "min_edge_after_costs" in v.blocking or "positive_kelly" in v.blocking


def test_liquidity_guard_rejects_a_thin_book():
    e = RiskEngine(settings())
    v = evaluate(e, good_thesis(), liq=100.0)
    assert "liquidity" in v.blocking


def test_venue_cap_rejects_concentration():
    e = RiskEngine(settings(max_venue_pct=0.10))
    v = evaluate(e, good_thesis(), positions=[position(95.0)])
    assert "venue_exposure" in v.blocking


def test_total_risk_cap_rejects_an_overfull_book():
    e = RiskEngine(settings(max_total_risk_pct=0.05))
    v = evaluate(e, good_thesis(), positions=[position(45.0, venue="crypto")])
    assert "total_risk" in v.blocking


def test_correlation_cap_stops_one_bet_in_three_costumes():
    e = RiskEngine(settings(max_correlation_pct=0.05))
    v = evaluate(
        e,
        good_thesis(correlation_group="us_rates"),
        positions=[position(45.0, group="us_rates")],
    )
    assert "correlation" in v.blocking


def test_uncorrelated_positions_do_not_accumulate_group_exposure():
    e = RiskEngine(settings(max_correlation_pct=0.01))
    v = evaluate(
        e,
        good_thesis(correlation_group="uncorrelated"),
        positions=[position(500.0, group="uncorrelated")],
    )
    assert "correlation" not in v.blocking


def test_incomplete_thesis_cannot_reach_capital():
    e = RiskEngine(settings())
    assert "thesis_complete" in evaluate(e, good_thesis(kill_thesis="  ")).blocking
    assert "thesis_complete" in evaluate(e, good_thesis(sources=[])).blocking


# ── circuit breakers trip the kill switch, not just reject ───────────────
def test_daily_drawdown_breach_trips_the_kill_switch():
    e = RiskEngine(settings())
    v = evaluate(e, good_thesis(), ddd=0.15)
    assert "daily_drawdown" in v.blocking
    assert e.kill.tripped, "a breach must halt the system, not merely decline one trade"


def test_level_drawdown_breach_trips_the_kill_switch():
    e = RiskEngine(settings())
    evaluate(e, good_thesis(), ldd=0.30)
    assert e.kill.tripped


def test_breakers_sweep_independently_of_any_thesis():
    e = RiskEngine(settings())
    breaches = e.check_breakers(0.20, 0.0)
    assert breaches and e.kill.tripped


def test_only_a_human_rearm_clears_the_halt():
    e = RiskEngine(settings())
    e.check_breakers(0.20, 0.0)
    assert e.kill.tripped
    assert e.kill.rearm("human") is True
    assert not e.kill.tripped
    assert e.kill.breaches[-1].rearmed_by == "human"
    assert e.kill.rearm("human") is False, "re-arming a clear system is a no-op"


# ── the reserve is arithmetically untouchable ────────────────────────────
def test_sizing_uses_deployable_not_total_equity():
    e = RiskEngine(settings())
    full = evaluate(e, good_thesis(), l=ladder(equity=1000.0, reserve=0.0))
    halved = evaluate(e, good_thesis(), l=ladder(equity=1000.0, reserve=500.0))
    assert halved.approved_size_usd == pytest.approx(full.approved_size_usd / 2)


def test_reserve_is_never_deployable_even_at_max_size():
    e = RiskEngine(settings(max_position_pct=1.0, max_total_risk_pct=1.0, max_venue_pct=1.0))
    l = ladder(equity=1000.0, reserve=900.0)
    v = evaluate(e, good_thesis(recommended_size_pct=1.0), l=l)
    assert v.approved_size_usd <= l.deployable + 1e-9
    assert v.approved_size_usd <= 100.0 + 1e-9


# ── tier / paper-first mandate ───────────────────────────────────────────
def test_non_paper_tier_cannot_even_be_configured():
    with pytest.raises(Exception):
        settings(autonomy_tier="T3")


# ── utilization view ─────────────────────────────────────────────────────
def test_utilization_reports_every_venue_and_group():
    e = RiskEngine(settings())
    rows = e.utilization(ladder(), [position(50.0, "crypto", "btc_beta")])
    names = {r["name"] for r in rows}
    assert "Total gross risk" in names
    assert "Venue: crypto" in names
    assert "Correlation: btc_beta" in names
    crypto = next(r for r in rows if r["name"] == "Venue: crypto")
    assert crypto["used"] == 50.0
    assert 0 < crypto["pct"] < 1


# ── the two sizing models must not be conflated ──────────────────────────
def directional_thesis(**over) -> InvestmentThesis:
    d = dict(
        venue="crypto",
        instrument="ETH-PERP",
        direction="short",
        thesis="funding carry",
        edge_type="funding",
        win_probability=0.68,
        entry=Entry(level=3400.0),
        exit=Exit(target=3400.0 * (1 - 0.0667), stop=3400.0 * (1 + 0.04)),
        fees_slippage_pct=0.0009,
        recommended_size_pct=0.10,
        kill_thesis="funding normalises",
        sources=["https://docs.ccxt.com/"],
        correlation_group="crypto_beta",
    )
    d.update(over)
    return InvestmentThesis(**d)


def test_directional_thesis_is_gated_on_notional_ev():
    """Regression: previously reported ~+81% EV, which sailed past the 2% gate
    on a unit error rather than on a real edge."""
    e = RiskEngine(settings())
    v = evaluate(e, directional_thesis())
    ev_check = next(c for c in v.checks if c.name == "min_edge_after_costs")
    assert 0.02 < ev_check.actual < 0.06, f"EV {ev_check.actual} is not per-notional"
    assert v.decision == "approved", v.blocking


def test_a_thin_directional_edge_is_now_correctly_rejected():
    """A 0.5% target against a 0.4% stop at coin-flip odds is not a trade."""
    e = RiskEngine(settings())
    t = directional_thesis(
        win_probability=0.52,
        entry=Entry(level=100.0),
        exit=Exit(target=100.5, stop=99.6),
        fees_slippage_pct=0.001,
    )
    v = evaluate(e, t)
    assert v.decision == "rejected"
    assert "min_edge_after_costs" in v.blocking


def test_prediction_market_still_uses_the_all_or_nothing_model():
    e = RiskEngine(settings())
    v = evaluate(e, good_thesis())
    ev = next(c for c in v.checks if c.name == "min_edge_after_costs").actual
    # p=0.70 at price 0.50 -> payoff 1.0 -> EV ~= 0.7*0.98 - 0.3*1.02 = 0.38
    assert ev == pytest.approx(0.38, abs=0.02)


def test_moves_from_levels_are_positive_fractions_both_directions():
    e = RiskEngine(settings())
    long_w, long_l = e._moves_from_levels(
        directional_thesis(direction="long", entry=Entry(level=100.0),
                           exit=Exit(target=110.0, stop=95.0))
    )
    assert long_w == pytest.approx(0.10)
    assert long_l == pytest.approx(0.05)
    short_w, short_l = e._moves_from_levels(
        directional_thesis(direction="short", entry=Entry(level=100.0),
                           exit=Exit(target=90.0, stop=105.0))
    )
    assert short_w == pytest.approx(0.10)
    assert short_l == pytest.approx(0.05)
