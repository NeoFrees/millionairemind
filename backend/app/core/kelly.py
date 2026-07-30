"""Position sizing. Fractional Kelly, always capped.

Full Kelly is the growth-optimal bet *only* if your probability estimate is
exactly right. It never is. Estimation error makes full Kelly badly
over-levered in practice, so we size at a fraction (default 1/4) and then
apply a hard absolute cap on top. The cap, not Kelly, is the binding
constraint most of the time — that is intentional.
"""
from __future__ import annotations


def kelly_binary(win_probability: float, payoff_ratio: float) -> float:
    """Full-Kelly fraction for a binary bet.

    payoff_ratio (b) = profit per unit staked if the bet wins.
    f* = (p*b - q) / b, where q = 1 - p. Negative edge -> 0 (never bet).
    """
    if payoff_ratio <= 0:
        return 0.0
    p = min(max(win_probability, 0.0), 1.0)
    q = 1.0 - p
    f = (p * payoff_ratio - q) / payoff_ratio
    return max(0.0, f)


def payoff_ratio_from_price(price: float) -> float:
    """For a prediction-market contract priced in [0,1], profit per unit staked."""
    if not (0.0 < price < 1.0):
        return 0.0
    return (1.0 - price) / price


def fractional_kelly_size_pct(
    win_probability: float,
    payoff_ratio: float,
    kelly_fraction: float,
    max_position_pct: float,
    fees_slippage_pct: float = 0.0,
) -> tuple[float, float]:
    """Return (recommended_pct_of_deployable, raw_full_kelly_pct).

    Fees and slippage are charged against the win payoff before sizing, so a
    thesis whose edge is eaten by frictions sizes to zero rather than small.
    """
    net_payoff = max(0.0, payoff_ratio - fees_slippage_pct)
    full = kelly_binary(win_probability, net_payoff)
    sized = min(full * kelly_fraction, max_position_pct)
    return max(0.0, sized), full


def expected_value_pct(
    win_probability: float, payoff_ratio: float, fees_slippage_pct: float = 0.0
) -> float:
    """EV per unit staked, net of frictions. Loss case forfeits the full stake.

    Correct for **all-or-nothing** instruments only — a prediction-market
    contract, where being wrong means the stake goes to zero. For a stopped
    directional trade use `expected_value_directional`, where being wrong costs
    the distance to the stop, not the whole notional.
    """
    p = min(max(win_probability, 0.0), 1.0)
    return p * (payoff_ratio - fees_slippage_pct) - (1.0 - p) * (1.0 + fees_slippage_pct)


# ─────────────────────────────────────────────────────────────────────────
# Directional trades: the stake is the distance to the stop, not the notional
# ─────────────────────────────────────────────────────────────────────────
#
# Conflating these two cases is the classic way to inflate a backtest. If you
# take the reward-to-risk ratio (say 1.67) and feed it into the binary formula
# above, you get an "EV" of ~+81% — but that is 81% of the *risk*, while the
# position size, the P&L and the min-edge gate are all denominated in
# *notional*. The two differ by a factor of 1/loss_move, which here is ~25x.
# Everything below is denominated in notional so the numbers compose.


def expected_value_directional(
    win_probability: float, win_move: float, loss_move: float, fees_slippage_pct: float = 0.0
) -> float:
    """EV per unit of notional for a trade with a target and a stop.

    win_move / loss_move are fractional price moves from entry to target and
    entry to stop respectively (both positive).
    """
    if win_move <= 0 or loss_move <= 0:
        return -fees_slippage_pct
    p = min(max(win_probability, 0.0), 1.0)
    return p * win_move - (1.0 - p) * loss_move - fees_slippage_pct


def kelly_directional(win_probability: float, win_move: float, loss_move: float) -> float:
    """Kelly-optimal notional as a fraction of bankroll for a stopped trade.

    Derivation: Kelly on the amount *at risk* is f_risk = (p·b − q)/b with
    b = win_move/loss_move. Converting risk to notional divides by loss_move,
    which simplifies to edge / (win_move · loss_move).

    This routinely returns values far above 1.0 — a 3% edge with a 0.5% stop is
    "6x levered" by Kelly's reckoning. That is exactly why the absolute position
    cap exists and why it, not Kelly, is usually the binding constraint.
    """
    if win_move <= 0 or loss_move <= 0:
        return 0.0
    p = min(max(win_probability, 0.0), 1.0)
    edge = p * win_move - (1.0 - p) * loss_move
    if edge <= 0:
        return 0.0
    return edge / (win_move * loss_move)


def fractional_kelly_directional(
    win_probability: float,
    win_move: float,
    loss_move: float,
    kelly_fraction: float,
    max_position_pct: float,
    fees_slippage_pct: float = 0.0,
) -> tuple[float, float]:
    """Return (recommended_pct_of_deployable, raw_full_kelly_pct) for a stopped trade."""
    # Charge frictions against the winning move — a target that only clears
    # after costs is not a target.
    net_win = max(0.0, win_move - fees_slippage_pct)
    full = kelly_directional(win_probability, net_win, loss_move + fees_slippage_pct)
    sized = min(full * kelly_fraction, max_position_pct)
    return max(0.0, sized), full
