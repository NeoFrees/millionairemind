"""Domain schemas. The InvestmentThesis is the gate: no capital moves without one."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

Venue = Literal["polymarket", "crypto", "equities"]
Direction = Literal["long", "short", "yes", "no"]
EdgeType = Literal["arbitrage", "mispricing", "mean_reversion", "catalyst", "funding", "other"]
Confidence = Literal["low", "medium", "high"]
ThesisStatus = Literal["proposed", "under_review", "approved", "rejected", "live", "closed"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


class Entry(BaseModel):
    level: float = 0.0
    conditions: str = ""


class Exit(BaseModel):
    target: float = 0.0
    stop: float = 0.0
    time_stop: Optional[str] = None


class InvestmentThesis(BaseModel):
    """The mandatory research gate. Diligence produces it; Guardian judges it."""

    id: str = Field(default_factory=_uuid)
    venue: Venue
    instrument: str
    direction: Direction
    thesis: str
    edge_type: EdgeType
    expected_value_pct: float = 0.0
    win_probability: float = Field(default=0.0, ge=0.0, le=1.0)
    probability_basis: str = ""
    entry: Entry = Field(default_factory=Entry)
    exit: Exit = Field(default_factory=Exit)
    fees_slippage_pct: float = 0.0
    liquidity_note: str = ""
    recommended_size_pct: float = 0.0
    kelly_fraction: float = 0.0
    correlation_note: str = ""
    correlation_group: str = "uncorrelated"
    kill_thesis: str = ""
    sources: list[str] = Field(default_factory=list)
    confidence: Confidence = "low"
    status: ThesisStatus = "proposed"
    created_by: str = "diligence"
    created_at: str = Field(default_factory=_now)
    # populated by Guardian
    risk_verdict: Optional[str] = None
    risk_notes: list[str] = Field(default_factory=list)
    approved_size_pct: float = 0.0


class Candidate(BaseModel):
    """Scout output — a raw lead, not yet researched."""

    id: str = Field(default_factory=_uuid)
    venue: Venue
    instrument: str
    direction: Direction
    edge_type: EdgeType
    raw_edge_pct: float
    liquidity_usd: float
    time_sensitivity: Literal["low", "medium", "high"] = "medium"
    note: str = ""
    discovered_by: str = "scout"
    discovered_at: str = Field(default_factory=_now)
    score: float = 0.0


class Position(BaseModel):
    id: str = Field(default_factory=_uuid)
    thesis_id: str
    venue: Venue
    instrument: str
    direction: Direction
    correlation_group: str = "uncorrelated"
    size_usd: float
    deployable_at_entry: float = 0.0
    entry_price: float
    mark_price: float
    stop: float = 0.0
    target: float = 0.0
    time_stop: Optional[str] = None
    opened_at: str = Field(default_factory=_now)
    closed_at: Optional[str] = None
    realized_pnl: float = 0.0
    kill_thesis: str = ""
    kill_proximity: float = 0.0  # 0 = healthy, 1 = kill thesis triggered
    status: Literal["open", "closed"] = "open"

    @property
    def size_pct_at_entry(self) -> float:
        """Fraction of deployable equity this position consumed when it was opened.

        Caps bind at entry. Once open, equity moves and this position's share of a
        *shrinking* book can drift above the cap without anyone breaking a rule —
        the alternative would be force-liquidating on every adverse tick, which
        turns a risk limit into a stop-loss generator. Drift is surfaced, not hidden.
        """
        d = self.deployable_at_entry
        return 0.0 if d <= 0 else self.size_usd / d

    @property
    def unrealized_pnl(self) -> float:
        if self.status == "closed" or self.entry_price <= 0:
            return 0.0
        move = (self.mark_price - self.entry_price) / self.entry_price
        if self.direction in ("short", "no"):
            move = -move
        return self.size_usd * move

    @property
    def market_value(self) -> float:
        return self.size_usd + self.unrealized_pnl


class Order(BaseModel):
    id: str = Field(default_factory=_uuid)
    thesis_id: str
    venue: Venue
    instrument: str
    direction: Direction
    size_usd: float
    order_type: Literal["market", "limit"] = "limit"
    limit_price: Optional[float] = None
    filled_size_usd: float = 0.0
    avg_fill_price: float = 0.0
    slippage_pct: float = 0.0
    status: Literal["pending", "partial", "filled", "rejected", "cancelled"] = "pending"
    paper: bool = True
    created_at: str = Field(default_factory=_now)
    reject_reason: Optional[str] = None


class LadderState(BaseModel):
    base_unit: float
    nodes: int
    current_node: int = 0
    equity: float = 0.0
    peak_equity: float = 0.0
    floor: float = 0.0
    reserve: float = 0.0
    level_start_equity: float = 0.0
    level_peak_equity: float = 0.0
    day_start_equity: float = 0.0
    ratchet_pct: float = 0.20
    levels_completed: int = 0
    regressions: int = 0
    history: list[dict] = Field(default_factory=list)

    @property
    def next_target(self) -> float:
        return self.base_unit * (2 ** (self.current_node + 1))

    @property
    def deployable(self) -> float:
        return max(0.0, self.equity - self.reserve)

    @property
    def progress_pct(self) -> float:
        lo, hi = self.level_start_equity, self.next_target
        if hi <= lo:
            return 1.0
        return max(0.0, min(1.0, (self.equity - lo) / (hi - lo)))


class RiskCheck(BaseModel):
    name: str
    passed: bool
    limit: float
    actual: float
    detail: str


class RiskVerdict(BaseModel):
    thesis_id: str
    decision: Literal["approved", "rejected", "needs_human"]
    approved_size_pct: float
    approved_size_usd: float
    checks: list[RiskCheck]
    blocking: list[str] = Field(default_factory=list)
    evaluated_at: str = Field(default_factory=_now)


class RiskBudget(BaseModel):
    """Per-level deployment budget, reset on every level-up."""

    node: int
    level_start_equity: float
    max_deployable_usd: float
    deployed_usd: float = 0.0
    realized_loss_usd: float = 0.0

    @property
    def remaining_usd(self) -> float:
        return max(0.0, self.max_deployable_usd - self.deployed_usd)


class AgentLog(BaseModel):
    id: str = Field(default_factory=_uuid)
    agent: str
    action: str
    subject_id: Optional[str] = None
    detail: str = ""
    severity: Literal["debug", "info", "warn", "error", "critical"] = "info"
    payload: dict = Field(default_factory=dict)
    at: str = Field(default_factory=_now)


class PaymentRequest(BaseModel):
    id: str = Field(default_factory=_uuid)
    rail: Literal["plaid_ach", "stripe", "gocardless", "internal"] = "internal"
    from_account: str
    to_account: str
    amount_usd: float
    purpose: str = ""
    status: Literal["pending_approval", "approved", "rejected", "settled", "failed"] = (
        "pending_approval"
    )
    requires_human: bool = True
    created_by: str = "treasury"
    created_at: str = Field(default_factory=_now)
    decided_at: Optional[str] = None
    decided_by: Optional[str] = None
    paper: bool = True


class ApprovalTicket(BaseModel):
    """One-tap human gate. Carries every number a human needs to decide."""

    id: str = Field(default_factory=_uuid)
    kind: Literal["trade", "payment"]
    thesis_id: Optional[str] = None
    payment_id: Optional[str] = None
    headline: str
    size_usd: float
    edge_pct: float
    expected_value_pct: float
    risk_summary: str
    checks: list[RiskCheck] = Field(default_factory=list)
    status: Literal["pending", "approved", "rejected", "expired"] = "pending"
    created_at: str = Field(default_factory=_now)
    decided_at: Optional[str] = None


class Breach(BaseModel):
    id: str = Field(default_factory=_uuid)
    limit_name: str
    limit: float
    actual: float
    action_taken: str
    at: str = Field(default_factory=_now)
    rearmed_at: Optional[str] = None
    rearmed_by: Optional[str] = None
