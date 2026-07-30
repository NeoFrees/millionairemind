import pytest

from app.core.kelly import (
    expected_value_pct,
    fractional_kelly_size_pct,
    kelly_binary,
    payoff_ratio_from_price,
)


def test_kelly_even_money_coin_flip_is_zero():
    assert kelly_binary(0.5, 1.0) == pytest.approx(0.0)


def test_kelly_known_value():
    # p=0.6, b=1 -> f* = (0.6*1 - 0.4)/1 = 0.20
    assert kelly_binary(0.6, 1.0) == pytest.approx(0.20)


def test_kelly_never_negative():
    assert kelly_binary(0.3, 1.0) == 0.0
    assert kelly_binary(0.0, 5.0) == 0.0


def test_kelly_zero_payoff_is_zero():
    assert kelly_binary(0.9, 0.0) == 0.0


def test_payoff_from_prediction_market_price():
    assert payoff_ratio_from_price(0.5) == pytest.approx(1.0)
    assert payoff_ratio_from_price(0.25) == pytest.approx(3.0)
    assert payoff_ratio_from_price(0.0) == 0.0
    assert payoff_ratio_from_price(1.0) == 0.0


def test_fractional_kelly_is_a_quarter_of_full():
    sized, full = fractional_kelly_size_pct(0.6, 1.0, 0.25, 1.0)
    assert full == pytest.approx(0.20)
    assert sized == pytest.approx(0.05)


def test_hard_cap_binds_over_kelly():
    sized, full = fractional_kelly_size_pct(0.95, 5.0, 0.25, 0.10)
    assert full > 0.4
    assert sized == pytest.approx(0.10), "the absolute cap must bind, not Kelly"


def test_fees_can_size_a_thesis_to_zero():
    sized, _ = fractional_kelly_size_pct(0.55, 1.0, 0.25, 0.10, fees_slippage_pct=0.9)
    assert sized == 0.0


def test_expected_value_sign():
    assert expected_value_pct(0.7, 1.0) > 0
    assert expected_value_pct(0.4, 1.0) < 0
    assert expected_value_pct(0.5, 1.0) == pytest.approx(0.0)


def test_expected_value_charges_frictions_both_ways():
    clean = expected_value_pct(0.7, 1.0, 0.0)
    dirty = expected_value_pct(0.7, 1.0, 0.05)
    assert dirty < clean


# ── directional trades: notional-denominated, which is the whole point ──────
from app.core.kelly import (  # noqa: E402
    expected_value_directional,
    fractional_kelly_directional,
    kelly_directional,
)


def test_directional_ev_is_per_notional_not_per_risk():
    """Regression: the bug this replaced reported +81% EV on a ~3% edge by
    dividing through the stop distance. EV must be in notional terms."""
    ev = expected_value_directional(0.68, 0.0667, 0.04, 0.0009)
    assert 0.02 < ev < 0.05, f"EV {ev} is not a plausible per-notional edge"


def test_directional_ev_matches_hand_computation():
    # 0.68 * 0.10 - 0.32 * 0.05 - 0.001 = 0.068 - 0.016 - 0.001 = 0.051
    assert expected_value_directional(0.68, 0.10, 0.05, 0.001) == pytest.approx(0.051)


def test_binary_and_directional_models_disagree_by_the_stop_distance():
    """Documents exactly why the two must not be interchanged."""
    p, win_move, loss_move = 0.68, 0.0667, 0.04
    binary = expected_value_pct(p, win_move / loss_move, 0.0)     # per unit of RISK
    directional = expected_value_directional(p, win_move, loss_move, 0.0)  # per NOTIONAL
    assert binary / directional == pytest.approx(1 / loss_move, rel=0.02)
    assert binary > 15 * directional


def test_directional_ev_negative_when_probability_too_low():
    assert expected_value_directional(0.30, 0.10, 0.05) < 0


def test_directional_kelly_is_zero_without_edge():
    assert kelly_directional(0.30, 0.10, 0.05) == 0.0
    assert kelly_directional(0.9, 0.0, 0.05) == 0.0


def test_directional_kelly_can_exceed_one_so_the_cap_must_bind():
    """A tight stop makes Kelly demand leverage. The hard cap is what saves us."""
    full = kelly_directional(0.68, 0.0667, 0.004)
    assert full > 1.0
    sized, raw = fractional_kelly_directional(0.68, 0.0667, 0.004, 0.25, 0.10)
    assert raw > 1.0
    assert sized == pytest.approx(0.10), "the absolute cap must bind, not Kelly"


def test_directional_frictions_can_kill_a_thesis():
    sized, _ = fractional_kelly_directional(0.55, 0.005, 0.004, 0.25, 0.10, 0.006)
    assert sized == 0.0
