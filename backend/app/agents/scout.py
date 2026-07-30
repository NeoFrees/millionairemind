"""Scout — opportunity discovery. Produces ranked candidates, never theses.

Scans each venue for the inefficiency families in the spec: prediction-market
mispricing vs. a latent estimate, cross-venue spot/perp dislocation, funding
carry, and statistical mean-reversion. Output is a *lead*: cheap to generate,
worthless until Diligence researches it.
"""
from __future__ import annotations

from app.adapters.mocks import AdapterRegistry
from app.agents.base import Agent
from app.models.schemas import Candidate


class ScoutAgent(Agent):
    name = "scout"
    mandate = "Find candidate inefficiencies across venues and rank them."

    def __init__(self, bus, audit, registry: AdapterRegistry) -> None:
        super().__init__(bus, audit)
        self.reg = registry

    async def scan(self) -> list[Candidate]:
        cands: list[Candidate] = [
            *self._scan_prediction_markets(),
            *self._scan_crypto(),
            *self._scan_equities(),
        ]
        for c in cands:
            # Rank by edge, discounted by thinness of the book. A 20% edge in a
            # $5k book is worth less than a 4% edge in a $4m book.
            c.score = c.raw_edge_pct * min(1.0, c.liquidity_usd / 250_000)
        cands.sort(key=lambda c: c.score, reverse=True)
        self.log(
            "scan_complete",
            detail=f"{len(cands)} candidates",
            payload={"top": [c.instrument for c in cands[:3]]},
        )
        if cands:
            await self.emit("candidates.found", {"count": len(cands)})
        return cands

    def _scan_prediction_markets(self) -> list[Candidate]:
        out: list[Candidate] = []
        pm = self.reg.polymarket
        for sym in pm.instruments():
            q = pm.quote(sym)
            latent = pm.latent_probability(sym)
            # Buy YES when the market prices below our latent estimate.
            edge = latent - q.ask
            if edge > 0.03:
                out.append(
                    Candidate(
                        venue="polymarket",
                        instrument=sym,
                        direction="yes",
                        edge_type="mispricing",
                        raw_edge_pct=edge,
                        liquidity_usd=q.depth_usd,
                        time_sensitivity="high",
                        note=f"ask {q.ask:.3f} vs modelled {latent:.3f}",
                    )
                )
            elif (q.bid - latent) > 0.03:
                out.append(
                    Candidate(
                        venue="polymarket",
                        instrument=sym,
                        direction="no",
                        edge_type="mispricing",
                        raw_edge_pct=q.bid - latent,
                        liquidity_usd=q.depth_usd,
                        time_sensitivity="high",
                        note=f"bid {q.bid:.3f} vs modelled {latent:.3f}",
                    )
                )
        return out

    def _scan_crypto(self) -> list[Candidate]:
        out: list[Candidate] = []
        cx = self.reg.crypto
        # Cross-venue / spot-perp basis dislocation.
        spot = cx.quote("BTC-SPOT").mid
        perp = cx.quote("BTC-PERP").mid
        basis = (perp - spot) / spot
        if abs(basis) > 0.0015:
            out.append(
                Candidate(
                    venue="crypto",
                    instrument="BTC-PERP/BTC-SPOT",
                    direction="short" if basis > 0 else "long",
                    edge_type="arbitrage",
                    raw_edge_pct=abs(basis),
                    liquidity_usd=min(cx.quote("BTC-SPOT").depth_usd, cx.quote("BTC-PERP").depth_usd),
                    time_sensitivity="high",
                    note=f"perp/spot basis {basis:+.4%}",
                )
            )
        # Funding carry: collect funding by being short an expensively-funded perp.
        for sym in ("ETH-PERP", "SOL-PERP", "BTC-PERP"):
            f = cx.funding_rate(sym)
            annualized = f * 3 * 365
            if abs(annualized) > 0.15:
                out.append(
                    Candidate(
                        venue="crypto",
                        instrument=sym,
                        direction="short" if f > 0 else "long",
                        edge_type="funding",
                        raw_edge_pct=abs(annualized) / 12,
                        liquidity_usd=cx.quote(sym).depth_usd,
                        time_sensitivity="medium",
                        note=f"funding {f:+.5f}/8h ({annualized:+.1%} ann.)",
                    )
                )
        return out

    def _scan_equities(self) -> list[Candidate]:
        out: list[Candidate] = []
        eq = self.reg.equities
        for sym in eq.instruments():
            s = eq.syms[sym]
            # Crude z-score stand-in: distance from a slow anchor.
            anchor = getattr(s, "latent", 0.0) or s.price
            if sym not in _ANCHORS:
                _ANCHORS[sym] = s.price
            _ANCHORS[sym] = _ANCHORS[sym] * 0.98 + s.price * 0.02
            anchor = _ANCHORS[sym]
            dev = (s.price - anchor) / anchor
            if abs(dev) > 0.008:
                out.append(
                    Candidate(
                        venue="equities",
                        instrument=sym,
                        direction="short" if dev > 0 else "long",
                        edge_type="mean_reversion",
                        raw_edge_pct=abs(dev) * 0.6,
                        liquidity_usd=s.depth,
                        time_sensitivity="low",
                        note=f"{dev:+.2%} from 50-tick anchor",
                    )
                )
        return out


_ANCHORS: dict[str, float] = {}
