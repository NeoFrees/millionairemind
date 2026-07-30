"""Treasury — capital movement. Every real-money outflow is human-gated.

`requires_human` is computed from the autonomy tier, and in T0/T1/T2 it is
always True for external rails. The protected reserve is refused at the adapter
boundary too, so a bug here still cannot spend the floor.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.adapters.base import LiveTradingDisabled
from app.adapters.mocks import AdapterRegistry
from app.agents.base import Agent
from app.models.schemas import ApprovalTicket, PaymentRequest


class TreasuryAgent(Agent):
    name = "treasury"
    mandate = "Move capital between accounts. Human-gated by default."

    # Above this fraction of equity, a transfer is gated even at T3.
    T3_AUTO_LIMIT_PCT = 0.05

    def __init__(self, bus, audit, registry: AdapterRegistry, tier: str) -> None:
        super().__init__(bus, audit)
        self.reg = registry
        self.tier = tier

    def accounts(self) -> list[dict]:
        return self.reg.bank.accounts()

    async def request(
        self,
        from_account: str,
        to_account: str,
        amount_usd: float,
        purpose: str,
        rail: str = "internal",
        equity: float = 0.0,
    ) -> tuple[PaymentRequest, ApprovalTicket | None]:
        gated = self._requires_human(rail, amount_usd, equity)
        pr = PaymentRequest(
            rail=rail,  # type: ignore[arg-type]
            from_account=from_account,
            to_account=to_account,
            amount_usd=amount_usd,
            purpose=purpose,
            requires_human=gated,
            created_by=self.name,
        )
        self.log(
            "payment_requested",
            pr.id,
            f"${amount_usd:,.2f} {from_account} -> {to_account} via {rail} "
            f"({'human-gated' if gated else 'auto within cap'})",
            "info",
            {"payment": pr.model_dump()},
        )
        ticket = None
        if gated:
            ticket = ApprovalTicket(
                kind="payment",
                payment_id=pr.id,
                headline=f"Move ${amount_usd:,.2f}: {from_account} → {to_account}",
                size_usd=amount_usd,
                edge_pct=0.0,
                expected_value_pct=0.0,
                risk_summary=(
                    f"Rail: {rail}. Purpose: {purpose}. Paper mode — no real funds move. "
                    f"Tier {self.tier} gates all external rails."
                ),
            )
            await self.emit("treasury.approval_required", {"payment_id": pr.id})
        else:
            await self.settle(pr)
        return pr, ticket

    def _requires_human(self, rail: str, amount_usd: float, equity: float) -> bool:
        if rail != "internal":
            # Every external rail is gated below T3, and above T3's cap regardless.
            return self.tier != "T3" or amount_usd > equity * self.T3_AUTO_LIMIT_PCT
        return self.tier in ("T0", "T1")

    async def settle(self, pr: PaymentRequest) -> PaymentRequest:
        try:
            self.reg.bank.transfer(pr.from_account, pr.to_account, pr.amount_usd, paper=True)
            pr.status = "settled"
        except (LiveTradingDisabled, ValueError) as e:
            pr.status = "failed"
            self.log("payment_failed", pr.id, str(e), "error")
            await self.emit("treasury.failed", {"payment_id": pr.id, "reason": str(e)})
            return pr
        pr.decided_at = datetime.now(timezone.utc).isoformat()
        self.log(
            "payment_settled",
            pr.id,
            f"${pr.amount_usd:,.2f} {pr.from_account} -> {pr.to_account} [PAPER]",
            "info",
        )
        await self.emit("treasury.settled", {"payment_id": pr.id})
        return pr

    async def sweep_to_reserve(self, amount_usd: float) -> PaymentRequest:
        """Called on level-up. Internal move into the untouchable account."""
        pr = PaymentRequest(
            rail="internal",
            from_account="checking",
            to_account="protected_reserve",
            amount_usd=amount_usd,
            purpose="ratchet sweep on level-up",
            requires_human=False,
            created_by=self.name,
        )
        bank = self.reg.bank
        # The sweep is bookkeeping over paper equity; credit the reserve directly
        # rather than failing on a synthetic checking balance.
        bank.balances["protected_reserve"] += amount_usd
        bank.ledger.append(
            {
                "from": "realized_gains",
                "to": "protected_reserve",
                "amount_usd": amount_usd,
                "paper": True,
                "status": "settled",
            }
        )
        pr.status = "settled"
        pr.decided_at = datetime.now(timezone.utc).isoformat()
        self.log(
            "ratchet_sweep",
            pr.id,
            f"${amount_usd:,.2f} locked into protected reserve — floor raised",
            "info",
        )
        return pr
