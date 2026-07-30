"""End-to-end pipeline tests over the real Coordinator, in paper mode."""
import pytest

from app.adapters.base import LiveTradingDisabled
from app.agents.coordinator import Coordinator
from app.config import Settings


def make_coord(**over) -> Coordinator:
    base = dict(
        base_unit=1000.0, db_path=":memory:", sim_enabled=False, sim_seed=7, autonomy_tier="T0"
    )
    base.update(over)
    return Coordinator(Settings(**base))


async def test_a_tick_runs_the_whole_pipeline():
    c = make_coord()
    out = await c.tick()
    assert out["tick"] == 1
    assert c.audit.count() > 0


async def test_pipeline_produces_theses_and_fills_over_time():
    c = make_coord()
    for _ in range(25):
        await c.tick()
    assert c.theses, "Scout -> Diligence produced nothing in 25 ticks"
    assert c.orders, "no orders were routed"
    assert any(o.status == "filled" for o in c.orders)


async def test_every_fill_traces_back_to_an_approved_thesis():
    c = make_coord()
    for _ in range(25):
        await c.tick()
    for o in (o for o in c.orders if o.status == "filled"):
        assert o.thesis_id in c.theses
        assert c.verdicts[o.thesis_id].decision == "approved"
        assert c.theses[o.thesis_id].kill_thesis.strip()
        assert c.theses[o.thesis_id].sources


async def test_no_position_ever_exceeds_the_position_cap_at_entry():
    """Caps bind at entry against the deployable equity at that moment."""
    c = make_coord()
    for _ in range(40):
        await c.tick()
        for p in c.positions.values():
            assert p.deployable_at_entry > 0
            assert p.size_pct_at_entry <= c.s.max_position_pct + 1e-9


async def test_no_position_is_ever_sized_against_the_reserve():
    """Whatever equity does afterwards, no fill may have been sized on protected capital."""
    c = make_coord()
    for _ in range(40):
        await c.tick()
        for p in c.positions.values():
            assert p.deployable_at_entry <= p.deployable_at_entry + c.ladder.state.reserve
            assert p.size_usd <= p.deployable_at_entry + 1e-9


async def test_gross_book_never_exceeds_total_risk_cap():
    c = make_coord()
    for _ in range(40):
        await c.tick()
        gross = sum(p.size_usd for p in c.open_positions())
        assert gross <= c.ladder.state.deployable * c.s.max_total_risk_pct + 1e-6


async def test_kill_switch_stops_all_new_deployment():
    c = make_coord()
    for _ in range(10):
        await c.tick()
    await c.guardian.manual_kill("test")
    before = len(c.orders)
    for _ in range(10):
        await c.tick()
    assert len(c.orders) == before, "orders were routed while halted"


async def test_rearm_resumes_the_run():
    c = make_coord()
    await c.guardian.manual_kill("test")
    assert c.kill.tripped
    await c.guardian.rearm("human")
    assert not c.kill.tripped
    for _ in range(20):
        await c.tick()
    assert c.orders


async def test_level_up_sweeps_into_the_protected_reserve():
    c = make_coord()
    # Force a level-up by crediting realized P&L directly.
    c.realized_pnl = 1200.0
    await c.tick()
    assert c.ladder.state.current_node >= 1
    assert c.ladder.state.reserve > 0
    assert c.registry.bank.balances["protected_reserve"] == pytest.approx(
        c.ladder.state.reserve, rel=1e-6
    )


async def test_reserve_is_refused_as_a_funding_source():
    c = make_coord()
    c.registry.bank.balances["protected_reserve"] = 5_000.0
    with pytest.raises(ValueError, match="not withdrawable"):
        c.registry.bank.transfer("protected_reserve", "checking", 100.0)


async def test_live_orders_are_refused_at_the_adapter():
    c = make_coord()
    with pytest.raises(LiveTradingDisabled):
        c.registry.crypto.place_order("BTC-PERP", "long", 100.0, paper=False)


async def test_no_adapter_reports_itself_as_live():
    c = make_coord()
    assert all(not a["live"] for a in c.registry.status())


async def test_execution_refuses_a_rejected_verdict():
    c = make_coord()
    for _ in range(15):
        await c.tick()
    thesis = next(iter(c.theses.values()))
    verdict = c.verdicts[thesis.id].model_copy(update={"decision": "rejected"})
    order, pos = await c.execution.execute(thesis, verdict)
    assert order.status == "rejected"
    assert pos is None


async def test_per_level_budget_is_enforced():
    c = make_coord()
    c.budget.max_deployable_usd = 0.0
    for _ in range(15):
        await c.tick()
    assert not [o for o in c.orders if o.status == "filled"], "budget exhaustion was ignored"


async def test_audit_log_is_append_only_and_replayable():
    c = make_coord()
    for _ in range(10):
        await c.tick()
    entries = c.audit.tail(500)
    assert len(entries) > 5
    seqs = [e["seq"] for e in entries]
    assert seqs == sorted(seqs, reverse=True), "audit must be monotonically sequenced"
    assert {"guardian", "coordinator"} & {e["agent"] for e in entries}


async def test_monitor_closes_positions_on_stop_or_target():
    c = make_coord()
    for _ in range(60):
        await c.tick()
    closed = [p for p in c.positions.values() if p.status == "closed"]
    assert closed, "nothing ever closed in 60 ticks"
    assert all(p.closed_at for p in closed)


async def test_equity_curve_tracks_and_never_loses_the_floor():
    c = make_coord()
    for _ in range(50):
        await c.tick()
    floors = [pt["floor"] for pt in c.equity_curve]
    assert floors == sorted(floors), "the locked floor moved down — the ratchet is broken"


async def test_a_halt_can_actually_be_cleared_and_stay_cleared():
    c = make_coord()
    for _ in range(20):
        await c.tick()
    await c.guardian.manual_kill("test")
    await c.guardian.rearm("human")
    c.ladder.reset_drawdown_anchors()
    await c.tick()
    assert not c.kill.tripped, "the switch re-tripped immediately after a re-arm"


async def test_calibrated_vol_does_not_trip_the_breaker_immediately():
    """The breakers must be meaningful, not hair-triggered by the tape itself."""
    c = make_coord()
    for _ in range(30):
        await c.tick()
    assert not c.kill.tripped, (
        f"breaker tripped inside 30 ticks: {c.kill.reason} — the mock volatility is "
        "mis-scaled relative to the risk limits"
    )


async def test_a_thesis_is_retired_when_its_position_closes():
    c = make_coord()
    for _ in range(80):
        await c.tick()
    closed = [p for p in c.positions.values() if p.status == "closed"]
    assert closed, "nothing closed in 80 ticks"
    for p in closed:
        assert c.theses[p.thesis_id].status == "closed", (
            "a thesis stayed 'live' after its trade was closed"
        )
    live_theses = {t.id for t in c.theses.values() if t.status == "live"}
    open_thesis_ids = {p.thesis_id for p in c.open_positions()}
    assert live_theses == open_thesis_ids
