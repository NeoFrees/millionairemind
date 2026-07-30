"""Thin adapter interface. Agents talk to these, never to a vendor SDK.

The contract is deliberately narrow so a real venue can be dropped in without
touching a single line of agent logic. Every adapter shipped here is a mock:
`is_live` is False and `place_order` refuses anything that is not paper.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class LiveTradingDisabled(RuntimeError):
    """Raised when anything attempts a non-paper order. Never caught silently."""


@dataclass(slots=True)
class Quote:
    instrument: str
    bid: float
    ask: float
    mid: float
    depth_usd: float

    @property
    def spread_pct(self) -> float:
        return 0.0 if self.mid <= 0 else (self.ask - self.bid) / self.mid


@dataclass(slots=True)
class Fill:
    instrument: str
    size_usd: float
    price: float
    slippage_pct: float
    paper: bool = True


class VenueAdapter(ABC):
    name: str = "abstract"
    venue: str = "abstract"
    is_live: bool = False

    @abstractmethod
    def instruments(self) -> list[str]: ...

    @abstractmethod
    def quote(self, instrument: str) -> Quote: ...

    @abstractmethod
    def tick(self) -> None:
        """Advance the adapter's internal market state one step (mocks only)."""

    def place_order(
        self, instrument: str, direction: str, size_usd: float, paper: bool = True
    ) -> Fill:
        if not paper or self.is_live:
            raise LiveTradingDisabled(
                f"{self.name}: live order routing is not implemented in this build. "
                "MillionaireMind ships paper-only (T0)."
            )
        return self._paper_fill(instrument, direction, size_usd)

    @abstractmethod
    def _paper_fill(self, instrument: str, direction: str, size_usd: float) -> Fill: ...


class BankAdapter(ABC):
    name: str = "abstract-bank"
    is_live: bool = False

    @abstractmethod
    def accounts(self) -> list[dict]: ...

    def transfer(self, from_account: str, to_account: str, amount_usd: float, paper: bool = True):
        if not paper or self.is_live:
            raise LiveTradingDisabled(
                f"{self.name}: real capital movement is not implemented in this build."
            )
        return self._paper_transfer(from_account, to_account, amount_usd)

    @abstractmethod
    def _paper_transfer(self, from_account: str, to_account: str, amount_usd: float) -> dict: ...
