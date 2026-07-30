import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertOctagon, Power, RotateCcw, ShieldCheck } from 'lucide-react'
import { Empty, KeyVal, LimitRow, Meter, Panel, cx } from '../components/ui'
import { api } from '../lib/api'
import { ago, clock, pct } from '../lib/format'
import type { Config, RiskState } from '../lib/types'
import { usePolled } from '../lib/useLive'

/** Screen 4 — Risk Console. Every hard limit, its live utilization, and the
 *  one control that overrides everything. The kill switch is deliberately
 *  unmissable and deliberately requires a second click. */
export default function Risk() {
  const { data, refresh } = usePolled<RiskState>(api.risk, 1500)
  const { data: cfg } = usePolled<Config>(api.config, 30000)
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!data || !cfg) return <Empty>Loading risk state…</Empty>
  const tripped = data.kill_switch.tripped

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); await refresh() } finally { setBusy(false); setArming(false) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] min-h-0">
      <div className="flex flex-col gap-4 min-h-0">
        {/* ── kill switch ─────────────────────────────────────────────── */}
        <section className={cx('panel p-5 transition-shadow', tripped && 'shadow-kill border-down/50')}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {tripped
                  ? <AlertOctagon size={16} className="text-down shrink-0" />
                  : <ShieldCheck size={16} className="text-up shrink-0" />}
                <h2 className={cx('text-sm font-bold tracking-wide', tripped ? 'text-down' : 'text-up')}>
                  {tripped ? 'SYSTEM HALTED' : 'SYSTEM ARMED'}
                </h2>
              </div>
              <p className="text-xs text-muted mt-2 leading-relaxed max-w-xl">
                {tripped ? (
                  <>Deployment is stopped. <span className="text-down num">{data.kill_switch.reason}</span>{' '}
                    Tripped {data.kill_switch.tripped_at ? `${ago(data.kill_switch.tripped_at)} ago` : ''}.
                    No agent can clear this — only a human re-arm resumes the run.</>
                ) : (
                  <>The Guardian is evaluating every thesis against the limits below and sweeping the
                    drawdown breakers on every tick. A breach halts the system automatically.</>
                )}
              </p>
            </div>

            <div className="shrink-0">
              {tripped ? (
                <button className="btn btn-up text-sm px-5 py-2.5" disabled={busy}
                  onClick={() => void act(api.rearm)}>
                  <RotateCcw size={13} className="inline mr-1.5 -mt-0.5" /> Re-arm system
                </button>
              ) : arming ? (
                <div className="flex items-center gap-2">
                  <motion.button
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                    className="rounded-lg bg-down/15 border border-down text-down font-bold text-sm px-5 py-2.5
                               hover:bg-down/25 shadow-kill"
                    disabled={busy} onClick={() => void act(api.kill)}>
                    Confirm — halt everything
                  </motion.button>
                  <button className="btn" onClick={() => setArming(false)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="rounded-lg border-2 border-down/60 text-down font-bold text-sm px-6 py-2.5
                             hover:bg-down/10 hover:border-down transition tracking-wide"
                  onClick={() => setArming(true)}>
                  <Power size={14} className="inline mr-2 -mt-0.5" /> KILL SWITCH
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── breakers ────────────────────────────────────────────────── */}
        <Panel title="Drawdown Circuit Breakers"
          subtitle="Swept every tick, independent of any thesis — a breach halts the system rather than declining one trade">
          <div className="grid sm:grid-cols-2 gap-6">
            <Breaker title="Daily drawdown" used={data.breakers.daily.used} limit={data.breakers.daily.limit} />
            <Breaker title="Per-level drawdown" used={data.breakers.level.used} limit={data.breakers.level.limit} />
          </div>
        </Panel>

        {/* ── utilization ─────────────────────────────────────────────── */}
        <Panel title="Exposure Utilization"
          subtitle="All caps are fractions of deployable equity — the protected reserve is arithmetically outside every one of them"
          className="min-h-0">
          <div className="overflow-y-auto max-h-[300px] pr-1">
            {data.utilization.map((u) => (
              <LimitRow key={u.name} name={u.name} used={u.used} limit={u.limit} ratio={u.pct} />
            ))}
          </div>
        </Panel>
      </div>

      {/* ── side rail ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
        <Panel title="Hard Limits" subtitle="Enforced in code, not in a prompt">
          <div className="space-y-0.5">
            <KeyVal k="Kelly fraction" v={`${cfg.limits.kelly_fraction}× full Kelly`} mono />
            <KeyVal k="Max per position" v={pct(cfg.limits.max_position_pct, 0)} mono />
            <KeyVal k="Max per venue" v={pct(cfg.limits.max_venue_pct, 0)} mono />
            <KeyVal k="Max gross book" v={pct(cfg.limits.max_total_risk_pct, 0)} mono />
            <KeyVal k="Max per correlation group" v={pct(cfg.limits.max_correlation_pct, 0)} mono />
            <KeyVal k="Daily drawdown breaker" v={pct(cfg.limits.max_daily_drawdown_pct, 0)} mono />
            <KeyVal k="Level drawdown breaker" v={pct(cfg.limits.max_level_drawdown_pct, 0)} mono />
            <KeyVal k="Min edge after costs" v={pct(cfg.limits.min_edge_pct, 0)} mono />
            <KeyVal k="Max share of book depth" v={pct(cfg.limits.max_liquidity_fraction, 0)} mono />
            <KeyVal k="Autonomy tier" v={<span className="text-cyan">{cfg.autonomy_tier} · paper</span>} mono />
          </div>
          <p className="text-2xs text-faint leading-relaxed mt-3 pt-3 border-t border-hair">
            An LLM can be argued out of a limit. A function cannot. Every check above is a pure
            function evaluated in <span className="num text-muted">core/risk.py</span>, and it is the
            only path to a non-zero position size.
          </p>
        </Panel>

        <Panel title="Breach History" subtitle="Halts and re-arms, newest first" pad={false} className="min-h-[160px]">
          {data.breaches.length === 0 ? (
            <Empty>No breaches. Every limit has held since this run began.</Empty>
          ) : (
            <ul className="divide-y divide-hair/50">
              {data.breaches.map((b) => (
                <li key={b.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-down">{b.limit_name}</span>
                    <span className="text-2xs num text-faint shrink-0">{clock(b.at)}</span>
                  </div>
                  <div className="text-2xs num text-muted mt-0.5">
                    {pct(b.actual)} vs limit {pct(b.limit)}
                  </div>
                  <div className="text-2xs text-faint mt-0.5 leading-snug">{b.action_taken}</div>
                  <div className="text-2xs mt-1">
                    {b.rearmed_at
                      ? <span className="text-up">re-armed by {b.rearmed_by} · {ago(b.rearmed_at)} ago</span>
                      : <span className="text-amber">awaiting human re-arm</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Breaker({ title, used, limit }: { title: string; used: number; limit: number }) {
  const ratio = limit > 0 ? used / limit : 0
  const headroom = Math.max(0, limit - used)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">{title}</span>
        <span className={cx('num text-lg font-semibold',
          ratio >= 0.85 ? 'text-down' : ratio >= 0.6 ? 'text-amber' : 'text-up')}>
          {pct(used, 2)}
        </span>
      </div>
      <div className="mt-2"><Meter value={ratio} /></div>
      <div className="flex justify-between mt-1.5 text-2xs num">
        <span className="text-faint">limit {pct(limit, 0)}</span>
        <span className={cx(headroom < 0.02 ? 'text-down' : 'text-muted')}>
          {pct(headroom, 2)} headroom
        </span>
      </div>
    </div>
  )
}
