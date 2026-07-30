"""MillionaireMind API — FastAPI. Typed routes over the Coordinator's state."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.agents.coordinator import Coordinator
from app.config import get_settings

settings = get_settings()
coord: Coordinator = Coordinator(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.sim_enabled:
        await coord.start()
    yield
    await coord.stop()


app = FastAPI(
    title="MillionaireMind",
    version="0.1.0",
    description=(
        "Autonomous, research-gated capital-compounding platform. "
        "Paper mode (T0) only — no live venue adapters are implemented."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── meta ─────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health() -> dict:
    return {
        "ok": True,
        "tier": settings.autonomy_tier,
        "paper_only": True,
        "live_adapters": False,
        "tick": coord.tick_count,
        "running": coord._running,
    }


@app.get("/api/config")
async def config() -> dict:
    s = settings
    return {
        "base_unit": s.base_unit,
        "ladder_nodes": s.ladder_nodes,
        "ratchet_pct": s.ratchet_pct,
        "autonomy_tier": s.autonomy_tier,
        "tick_seconds": s.sim_tick_seconds,
        "limits": {
            "kelly_fraction": s.kelly_fraction,
            "max_position_pct": s.max_position_pct,
            "max_venue_pct": s.max_venue_pct,
            "max_total_risk_pct": s.max_total_risk_pct,
            "max_correlation_pct": s.max_correlation_pct,
            "max_daily_drawdown_pct": s.max_daily_drawdown_pct,
            "max_level_drawdown_pct": s.max_level_drawdown_pct,
            "min_edge_pct": s.min_edge_pct,
            "max_liquidity_fraction": s.max_liquidity_fraction,
        },
    }


# ── ladder ───────────────────────────────────────────────────────────────
@app.get("/api/ladder")
async def ladder() -> dict:
    st = coord.ladder.state
    return {
        **st.model_dump(),
        "next_target": st.next_target,
        "deployable": st.deployable,
        "progress_pct": st.progress_pct,
        "targets": coord.ladder.node_targets(),
        "daily_drawdown_pct": coord.ladder.daily_drawdown_pct(),
        "level_drawdown_pct": coord.ladder.level_drawdown_pct(),
    }


@app.get("/api/dashboard")
async def dashboard() -> dict:
    st = coord.ladder.state
    return {
        "snapshot": coord.snapshot_light(),
        "equity_curve": coord.equity_curve[-240:],
        "positions": [
            {**p.model_dump(), "unrealized_pnl": p.unrealized_pnl, "market_value": p.market_value}
            for p in coord.positions.values()
        ],
        "activity": coord.activity[-60:][::-1],
        "drawdown_headroom": {
            "daily": max(0.0, settings.max_daily_drawdown_pct - coord.ladder.daily_drawdown_pct()),
            "level": max(0.0, settings.max_level_drawdown_pct - coord.ladder.level_drawdown_pct()),
        },
        "budget": {
            **coord.budget.model_dump(),
            "remaining_usd": coord.budget.remaining_usd,
        },
        "reserve": st.reserve,
    }


# ── research pipeline ────────────────────────────────────────────────────
@app.get("/api/candidates")
async def candidates() -> list[dict]:
    return [c.model_dump() for c in coord.candidates]


@app.get("/api/theses")
async def theses() -> list[dict]:
    out = []
    for t in coord.theses.values():
        d = t.model_dump()
        v = coord.verdicts.get(t.id)
        d["checks"] = [c.model_dump() for c in v.checks] if v else []
        out.append(d)
    return sorted(out, key=lambda d: d["created_at"], reverse=True)


@app.get("/api/theses/{thesis_id}")
async def thesis(thesis_id: str) -> dict:
    t = coord.theses.get(thesis_id)
    if not t:
        raise HTTPException(404, "thesis not found")
    v = coord.verdicts.get(thesis_id)
    return {"thesis": t.model_dump(), "verdict": v.model_dump() if v else None}


@app.get("/api/orders")
async def orders() -> list[dict]:
    return [o.model_dump() for o in coord.orders][::-1]


# ── risk console ─────────────────────────────────────────────────────────
@app.get("/api/risk")
async def risk() -> dict:
    return {
        "kill_switch": {
            "tripped": coord.kill.tripped,
            "reason": coord.kill.reason,
            "tripped_at": coord.kill.tripped_at,
        },
        "utilization": coord.risk.utilization(coord.ladder.state, coord.open_positions()),
        "breakers": {
            "daily": {
                "used": coord.ladder.daily_drawdown_pct(),
                "limit": settings.max_daily_drawdown_pct,
            },
            "level": {
                "used": coord.ladder.level_drawdown_pct(),
                "limit": settings.max_level_drawdown_pct,
            },
        },
        "position_cap_pct": settings.max_position_pct,
        "kelly_fraction": settings.kelly_fraction,
        "breaches": [b.model_dump() for b in coord.kill.breaches][::-1],
    }


@app.post("/api/risk/kill")
async def kill() -> dict:
    return await coord.guardian.manual_kill("human")


@app.post("/api/risk/rearm")
async def rearm() -> dict:
    ok = await coord.guardian.rearm("human")
    if ok:
        # Re-anchor the breakers, or the same still-true drawdown reading
        # re-trips the switch on the next tick and the halt is permanent.
        coord.ladder.reset_drawdown_anchors()
        coord.audit.write(
            "human", "drawdown_anchors_reset", None,
            f"breakers re-anchored to equity ${coord.equity():,.2f} on re-arm", "warn",
        )
    return {"rearmed": ok, "tripped": coord.kill.tripped}


# ── treasury & approvals ─────────────────────────────────────────────────
@app.get("/api/treasury")
async def treasury() -> dict:
    return {
        "accounts": coord.treasury.accounts(),
        "adapters": coord.registry.status(),
        "payments": [p.model_dump() for p in coord.payments.values()][::-1],
        "tickets": [t.model_dump() for t in coord.tickets.values()][::-1],
        "ledger": coord.registry.bank.ledger[-50:][::-1],
        "tier": settings.autonomy_tier,
    }


@app.post("/api/treasury/transfer")
async def transfer(body: dict = Body(...)) -> dict:
    try:
        pr, ticket = await coord.treasury.request(
            body["from_account"],
            body["to_account"],
            float(body["amount_usd"]),
            body.get("purpose", "manual transfer"),
            body.get("rail", "internal"),
            coord.equity(),
        )
    except (KeyError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    coord.payments[pr.id] = pr
    if ticket:
        coord.tickets[ticket.id] = ticket
    return {"payment": pr.model_dump(), "ticket": ticket.model_dump() if ticket else None}


@app.post("/api/approvals/{ticket_id}")
async def decide(ticket_id: str, body: dict = Body(...)) -> dict:
    if ticket_id not in coord.tickets:
        raise HTTPException(404, "ticket not found")
    t = await coord.decide_ticket(ticket_id, bool(body.get("approve", False)))
    return t.model_dump()


@app.get("/api/audit")
async def audit(limit: int = 150, subject: str | None = None) -> dict:
    return {"count": coord.audit.count(), "entries": coord.audit.tail(limit, subject)}


# ── control ──────────────────────────────────────────────────────────────
@app.post("/api/sim/start")
async def sim_start() -> dict:
    await coord.start()
    return {"running": True}


@app.post("/api/sim/stop")
async def sim_stop() -> dict:
    await coord.stop()
    return {"running": False}


@app.post("/api/sim/tick")
async def sim_tick() -> dict:
    return await coord.tick()


# ── realtime ─────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws(socket: WebSocket) -> None:
    await socket.accept()
    coord.broadcaster.add(socket)
    try:
        await socket.send_json({"event": "snapshot", "data": coord.snapshot_light()})
        while True:
            # Keep the socket open; the Broadcaster pushes, clients don't poll.
            await asyncio.sleep(30)
            await socket.send_json({"event": "ping", "data": {"tick": coord.tick_count}})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        coord.broadcaster.remove(socket)
