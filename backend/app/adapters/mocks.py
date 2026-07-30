"""Seeded mock adapters — one per venue in the spec, all paper-only.

Volatility calibration: one tick represents roughly **one hour** of market
time, so the per-tick sigmas below are hourly, not daily. This matters more
than it looks — feeding daily-magnitude vol into a 2-second tick makes the
25% per-level drawdown breaker fire within a minute every single run, which
would make the risk core look broken when it is in fact working correctly.
Scale the whole regime with `vol_scale` if you want a calmer or wilder tape.

Each carries a small synthetic market with its own realistic character:
crypto is volatile with funding rates, prediction markets are bounded in
[0.01, 0.99] and mean-revert toward a latent truth, equities drift slowly with
occasional catalyst gaps. Seeded so a run is reproducible and replayable.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from app.adapters.base import BankAdapter, Fill, Quote, VenueAdapter


@dataclass
class _Sym:
    name: str
    price: float
    vol: float
    depth: float
    latent: float = 0.5
    funding: float = 0.0


class MockCryptoAdapter(VenueAdapter):
    name = "mock-crypto"
    venue = "crypto"
    is_live = False

    def __init__(self, seed: int = 1337, vol_scale: float = 1.0) -> None:
        self.rng = random.Random(seed)
        self.vol_scale = vol_scale
        # hourly sigmas
        self.syms: dict[str, _Sym] = {
            "BTC-PERP": _Sym("BTC-PERP", 68000.0, 0.0040, 4_000_000, funding=0.0001),
            "ETH-PERP": _Sym("ETH-PERP", 3400.0, 0.0055, 1_500_000, funding=0.00018),
            "SOL-PERP": _Sym("SOL-PERP", 165.0, 0.0095, 600_000, funding=0.00042),
            "BTC-SPOT": _Sym("BTC-SPOT", 68010.0, 0.0038, 6_000_000),
        }

    def instruments(self) -> list[str]:
        return list(self.syms)

    def quote(self, instrument: str) -> Quote:
        s = self.syms[instrument]
        half = s.price * 0.0004
        return Quote(instrument, s.price - half, s.price + half, s.price, s.depth)

    def funding_rate(self, instrument: str) -> float:
        return self.syms[instrument].funding

    def tick(self) -> None:
        for s in self.syms.values():
            s.price *= 1.0 + self.rng.gauss(0, s.vol * self.vol_scale)
            s.price = max(s.price, 0.01)
            s.funding = max(-0.003, min(0.003, s.funding + self.rng.gauss(0, 0.00006)))

    def _paper_fill(self, instrument: str, direction: str, size_usd: float) -> Fill:
        q = self.quote(instrument)
        impact = min(0.02, size_usd / max(q.depth_usd, 1.0) * 0.5)
        slip = q.spread_pct / 2 + impact
        px = q.mid * (1 + slip) if direction in ("long", "yes") else q.mid * (1 - slip)
        return Fill(instrument, size_usd, px, slip)


class MockPolymarketAdapter(VenueAdapter):
    name = "mock-polymarket-clob"
    venue = "polymarket"
    is_live = False

    def __init__(self, seed: int = 1337, vol_scale: float = 1.0) -> None:
        self.rng = random.Random(seed + 1)
        self.vol_scale = vol_scale
        # sigmas in probability points per tick — prediction markets are jumpy
        # but bounded, so absolute (not proportional) noise is the right model
        self.syms: dict[str, _Sym] = {
            "FED-CUT-SEP": _Sym("FED-CUT-SEP", 0.62, 0.008, 120_000, latent=0.70),
            "ETF-APPROVAL-Q4": _Sym("ETF-APPROVAL-Q4", 0.41, 0.011, 80_000, latent=0.33),
            "GDP-BEAT-Q3": _Sym("GDP-BEAT-Q3", 0.55, 0.009, 45_000, latent=0.52),
            "ELECTION-TURNOUT-HI": _Sym("ELECTION-TURNOUT-HI", 0.28, 0.013, 30_000, latent=0.40),
        }

    def instruments(self) -> list[str]:
        return list(self.syms)

    def quote(self, instrument: str) -> Quote:
        s = self.syms[instrument]
        half = 0.006
        return Quote(instrument, max(0.01, s.price - half), min(0.99, s.price + half), s.price, s.depth)

    def latent_probability(self, instrument: str) -> float:
        """The mock's ground truth. A real Diligence agent estimates this from
        sources; here it lets us generate theses with a defensible basis."""
        return self.syms[instrument].latent

    def tick(self) -> None:
        for s in self.syms.values():
            pull = (s.latent - s.price) * 0.05
            s.price = max(
                0.01, min(0.99, s.price + pull + self.rng.gauss(0, s.vol * self.vol_scale))
            )
            s.latent = max(0.02, min(0.98, s.latent + self.rng.gauss(0, 0.0015)))

    def _paper_fill(self, instrument: str, direction: str, size_usd: float) -> Fill:
        q = self.quote(instrument)
        impact = min(0.03, size_usd / max(q.depth_usd, 1.0) * 0.8)
        slip = q.spread_pct / 2 + impact
        px = q.mid * (1 + slip) if direction in ("long", "yes") else q.mid * (1 - slip)
        return Fill(instrument, size_usd, max(0.01, min(0.99, px)), slip)


class MockEquitiesAdapter(VenueAdapter):
    name = "mock-equities-paper"
    venue = "equities"
    is_live = False

    def __init__(self, seed: int = 1337, vol_scale: float = 1.0) -> None:
        self.rng = random.Random(seed + 2)
        self.vol_scale = vol_scale
        # hourly sigmas; equities are the calmest venue on the board
        self.syms: dict[str, _Sym] = {
            "SPY": _Sym("SPY", 545.0, 0.0012, 9_000_000),
            "QQQ": _Sym("QQQ", 470.0, 0.0017, 5_000_000),
            "IWM": _Sym("IWM", 215.0, 0.0021, 1_200_000),
            "XLE": _Sym("XLE", 92.0, 0.0026, 700_000),
        }

    def instruments(self) -> list[str]:
        return list(self.syms)

    def quote(self, instrument: str) -> Quote:
        s = self.syms[instrument]
        half = s.price * 0.00015
        return Quote(instrument, s.price - half, s.price + half, s.price, s.depth)

    def tick(self) -> None:
        for s in self.syms.values():
            # occasional catalyst gap — the reason a stop can be jumped
            gap = self.rng.gauss(0, s.vol * 6) if self.rng.random() < 0.02 else 0.0
            s.price = max(
                0.5, s.price * (1 + self.rng.gauss(0, s.vol * self.vol_scale) + gap)
            )

    def _paper_fill(self, instrument: str, direction: str, size_usd: float) -> Fill:
        q = self.quote(instrument)
        impact = min(0.01, size_usd / max(q.depth_usd, 1.0) * 0.3)
        slip = q.spread_pct / 2 + impact
        px = q.mid * (1 + slip) if direction in ("long", "yes") else q.mid * (1 - slip)
        return Fill(instrument, size_usd, px, slip)


@dataclass
class MockBankAdapter(BankAdapter):
    """Plaid/Stripe/GoCardless-shaped, entirely simulated. No network calls."""

    name: str = "mock-bank"
    is_live: bool = False
    balances: dict[str, float] = field(
        default_factory=lambda: {
            "checking": 2_500.00,
            "brokerage": 0.00,
            "crypto_venue": 0.00,
            "prediction_venue": 0.00,
            "protected_reserve": 0.00,
        }
    )
    ledger: list[dict] = field(default_factory=list)

    def accounts(self) -> list[dict]:
        return [
            {
                "id": k,
                "name": k.replace("_", " ").title(),
                "balance_usd": round(v, 2),
                "rail": "plaid_ach" if k == "checking" else "internal",
                "linked": True,
                "live": False,
            }
            for k, v in self.balances.items()
        ]

    def _paper_transfer(self, from_account: str, to_account: str, amount_usd: float) -> dict:
        if from_account not in self.balances or to_account not in self.balances:
            raise ValueError("unknown account")
        if to_account == "protected_reserve" and from_account == "protected_reserve":
            raise ValueError("no-op transfer")
        if from_account == "protected_reserve":
            raise ValueError(
                "protected_reserve is not withdrawable by agents — the ratchet floor is "
                "enforced at the adapter boundary as well as in the risk engine"
            )
        if self.balances[from_account] < amount_usd:
            raise ValueError(f"insufficient funds in {from_account}")
        self.balances[from_account] -= amount_usd
        self.balances[to_account] += amount_usd
        rec = {
            "from": from_account,
            "to": to_account,
            "amount_usd": amount_usd,
            "paper": True,
            "status": "settled",
        }
        self.ledger.append(rec)
        return rec


class AdapterRegistry:
    """Single place venues are resolved. Swap a mock for a live adapter here."""

    def __init__(self, seed: int = 1337, vol_scale: float = 1.0) -> None:
        self.crypto = MockCryptoAdapter(seed, vol_scale)
        self.polymarket = MockPolymarketAdapter(seed, vol_scale)
        self.equities = MockEquitiesAdapter(seed, vol_scale)
        self.bank = MockBankAdapter()

    def venue(self, name: str) -> VenueAdapter:
        return {
            "crypto": self.crypto,
            "polymarket": self.polymarket,
            "equities": self.equities,
        }[name]

    def all_venues(self) -> list[VenueAdapter]:
        return [self.polymarket, self.crypto, self.equities]

    def tick(self) -> None:
        for v in self.all_venues():
            v.tick()

    def status(self) -> list[dict]:
        return [
            {"name": v.name, "venue": v.venue, "live": v.is_live, "mode": "paper"}
            for v in self.all_venues()
        ] + [{"name": self.bank.name, "venue": "banking", "live": False, "mode": "paper"}]
