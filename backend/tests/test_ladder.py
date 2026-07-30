import pytest

from app.core.ladder import LadderEngine


def test_node_targets_are_powers_of_two():
    e = LadderEngine(base_unit=1.0, nodes=20)
    assert e.node_target(1) == 2
    assert e.node_target(10) == 1024
    assert e.node_target(20) == 1_048_576
    assert len(e.node_targets()) == 20


def test_custom_base_unit_scales_the_whole_ladder():
    e = LadderEngine(base_unit=250.0, nodes=20)
    assert e.node_target(1) == 500
    assert e.node_target(20) == 250 * 2**20


def test_level_up_fires_and_ratchets_reserve():
    e = LadderEngine(base_unit=1.0, ratchet_pct=0.20)
    events = e.set_equity(2.0)
    assert len(events) == 1 and events[0]["type"] == "level_up"
    assert e.state.current_node == 1
    # gain was 1.00, 20% swept
    assert e.state.reserve == pytest.approx(0.20)
    assert e.state.floor == pytest.approx(0.20)


def test_reserve_is_excluded_from_deployable():
    e = LadderEngine(base_unit=1.0, ratchet_pct=0.20)
    e.set_equity(2.0)
    assert e.state.deployable == pytest.approx(2.0 - 0.20)


def test_multiple_rungs_in_one_violent_move():
    e = LadderEngine(base_unit=1.0, ratchet_pct=0.20)
    events = e.set_equity(8.5)
    assert [ev["type"] for ev in events] == ["level_up"] * 3
    assert e.state.current_node == 3


def test_regression_steps_the_ladder_down_visibly():
    e = LadderEngine(base_unit=1.0, ratchet_pct=0.20)
    e.set_equity(4.0)
    assert e.state.current_node == 2
    events = e.set_equity(1.9)
    assert e.state.current_node == 0
    assert e.state.regressions == 2
    assert all(ev["type"] == "regression" for ev in events)


def test_floor_never_falls_after_regression():
    """The whole point of the ratchet: a drawdown cannot lower the locked floor."""
    e = LadderEngine(base_unit=1.0, ratchet_pct=0.20)
    e.set_equity(4.0)
    floor_at_peak = e.state.floor
    e.set_equity(1.0)
    assert e.state.floor == floor_at_peak
    assert e.state.reserve == floor_at_peak


def test_reserve_grows_monotonically_across_a_full_run():
    e = LadderEngine(base_unit=1.0, ratchet_pct=0.20, nodes=20)
    prev = 0.0
    for n in range(1, 21):
        e.set_equity(float(2**n))
        assert e.state.reserve >= prev
        prev = e.state.reserve
    assert e.state.current_node == 20
    assert e.state.reserve > 100_000


def test_drawdown_readings():
    e = LadderEngine(base_unit=100.0, starting_equity=100.0)
    e.start_new_day()
    e.set_equity(90.0)
    assert e.daily_drawdown_pct() == pytest.approx(0.10)
    assert e.level_drawdown_pct() == pytest.approx(0.10)


def test_rejects_bad_params():
    with pytest.raises(ValueError):
        LadderEngine(base_unit=0)
    with pytest.raises(ValueError):
        LadderEngine(ratchet_pct=0.95)


def test_rearm_reanchors_breakers_so_a_halt_is_clearable():
    """Regression: without re-anchoring, a re-armed kill switch re-trips on the
    next tick from the same drawdown reading, making the halt permanent."""
    e = LadderEngine(base_unit=100.0, starting_equity=100.0)
    e.set_equity(140.0)
    e.set_equity(100.0)
    assert e.level_drawdown_pct() > 0.25
    e.reset_drawdown_anchors()
    assert e.level_drawdown_pct() == pytest.approx(0.0)
    assert e.daily_drawdown_pct() == pytest.approx(0.0)
