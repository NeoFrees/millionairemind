"""Central configuration. Every risk limit lives here and is enforced in code.

Design note: limits are deliberately *not* reachable by the LLM agents. Agents can
propose sizes; only `app.core.risk` decides what is allowed, and it reads from this
frozen settings object. There is no code path by which an agent can widen a limit.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AutonomyTier = Literal["T0", "T1", "T2", "T3"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MM_", env_file=".env", extra="ignore", frozen=True
    )

    # runtime
    env: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    db_path: str = "./millionairemind.db"

    # ladder
    base_unit: float = Field(default=1.0, gt=0)
    ladder_nodes: int = Field(default=20, ge=1, le=64)
    ratchet_pct: float = Field(default=0.20, ge=0.0, le=0.9)

    # autonomy
    autonomy_tier: AutonomyTier = "T0"

    # risk — hard limits, fractions of deployable equity
    kelly_fraction: float = Field(default=0.25, gt=0.0, le=1.0)
    max_position_pct: float = Field(default=0.10, gt=0.0, le=1.0)
    max_venue_pct: float = Field(default=0.35, gt=0.0, le=1.0)
    max_total_risk_pct: float = Field(default=0.50, gt=0.0, le=1.0)
    max_correlation_pct: float = Field(default=0.20, gt=0.0, le=1.0)
    max_daily_drawdown_pct: float = Field(default=0.10, gt=0.0, le=1.0)
    max_level_drawdown_pct: float = Field(default=0.25, gt=0.0, le=1.0)
    min_edge_pct: float = Field(default=0.02, ge=0.0)
    max_liquidity_fraction: float = Field(default=0.10, gt=0.0, le=1.0)

    # simulation
    sim_enabled: bool = True
    sim_tick_seconds: float = Field(default=2.0, gt=0.1)
    sim_seed: int = 1337
    # Scales every mock venue's per-tick sigma. 1.0 = one tick is roughly one
    # hour of market time. Raise it to stress-test the drawdown breakers.
    sim_vol_scale: float = Field(default=1.0, gt=0.0, le=20.0)

    @field_validator("autonomy_tier")
    @classmethod
    def _guard_tier(cls, v: str) -> str:
        # Live adapters are not implemented in this build. Refuse to boot in a tier
        # that would imply real capital movement — fail loudly rather than silently
        # pretending to be live.
        if v != "T0":
            raise ValueError(
                f"autonomy_tier={v} requires live venue adapters, which are not "
                "implemented in this build. Only T0 (paper) is available."
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
