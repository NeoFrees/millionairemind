import { useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
  Tooltip as RTooltip,
} from 'recharts'
import { ArrowUpDown, Radio } from 'lucide-react'
import {
  Allocation, Badge, Delta, Dir, Empty, Gauge, KeyVal, Meter, Panel, Pnl, Segmented,
  Stat, Tip, VenueTag, cx,
} from '../components/ui'
import { api } from '../lib/api'
import { ago, clock, pct, price, signedPct, titleize, usd } from '../lib/format'
import type { Dashboard as DashData, Position } from '../lib/types'
import { usePolled } from '../lib/useLive'

const PERIODS = ['1D', '1W', '1M', 'YTD'] as const
type Period = (typeof PERIODS)[number]

/** Parametric VaR shorthand: 1.645σ on a 1.6% daily vol assumption. Stated in
 *  micro-copy rather than presented as a model output, because it is not one. */
const VOL_ASSUMPTION = 0.016
const Z95 = 1.645

type SortKey = 'instrument' | 'size_usd' | 'unrealized_pnl' | 'kill_proximity'

/** Screen 1 — Capital Allocation & Execution.
 *  70/30 split: instrument + book on the left, risk dashboard on the right. */
export default function Dashboard() {
  const { data } = usePolled<DashData>(api.dashboard, 1800)
  const [period, setPeriod] = useState<Period>('1D')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'size_usd', dir: -1 })

  const open = useMemo(
    () => (data?.positions ?? []).filter((p) => p.status === 'open'),
    [data],
  )

  const sorted = useMemo(() => {
    const rows = [...open]
    rows.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * sort.dir
      }
      return ((av as number) - (bv as number)) * sort.dir
    })
    return rows
  }, [open, sort])

  const s = data?.snapshot

  // Sharpe from the actual equity series — annualised on tick cadence, which is
  // why it is labelled "session Sharpe" and not sold as a track record.
  const sharpe = useMemo(() => {
    const eq = (data?.equity_curve ?? []).map((p) => p.equity)
    if (eq.length < 3) return NaN
    const rets = eq.slice(1).map((v, i) => (v - eq[i]) / (eq[i] || 1))
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1))
    return sd > 0 ? (mean / sd) * Math.sqrt(rets.length) : NaN
  }, [data])

  // ── equity series, windowed by the period filter ────────────────────────
  const windowed = useMemo(() => {
    const curveSrc = data?.equity_curve ?? []
    const n = curveSrc.length
    const take = period === '1D' ? n : period === '1W' ? Math.ceil(n * 0.75)
      : period === '1M' ? Math.ceil(n * 0.5) : Math.ceil(n * 0.3)
    return curveSrc.slice(Math.max(0, n - take))
  }, [data, period])

  // Every hook above runs unconditionally — the loading guard has to sit below
  // them or React sees a different hook count between renders.
  if (!data || !s) return <Empty>Loading portfolio state…</Empty>

  const dayPnl = s.realized_pnl + s.unrealized_pnl
  const openEquity = s.equity - dayPnl
  const dayPct = openEquity > 0 ? dayPnl / openEquity : 0
  const toNext = Math.max(0, s.next_target - s.equity)
  const requiredReturn = s.equity > 0 ? toNext / s.equity : 0
  const grossExposure = open.reduce((a, p) => a + p.size_usd, 0)
  const var95 = grossExposure * VOL_ASSUMPTION * Z95
  const headroom = Math.min(data.drawdown_headroom.daily, data.drawdown_headroom.level)

  const vals = windowed.map((p) => p.equity)
  const floors = windowed.map((p) => p.floor).filter((f) => f > 0)
  const lo = Math.min(...vals, s.equity, ...floors)
  const hi = Math.max(...vals, s.equity)
  const pad = Math.max((hi - lo) * 0.12, hi * 0.015) || 0.01
  const yDomain: [number, number] = [Math.max(0, lo - pad), hi + pad]
  const targetInView = s.next_target <= hi + pad * 3

  const curve = windowed.map((p, i, arr) => {
    const prev = i > 0 ? arr[i - 1].equity : p.equity
    return {
      ...p,
      floorLine: p.floor > 0 ? p.floor : null,
      chg: prev > 0 ? (p.equity - prev) / prev : 0,
      high: Math.max(p.equity, prev),
      open: prev,
    }
  })

  const byClass = Object.entries(
    open.reduce<Record<string, number>>((acc, p) => {
      acc[titleize(p.venue)] = (acc[titleize(p.venue)] ?? 0) + p.size_usd
      return acc
    }, {}),
  ).map(([name, value]) => ({ name, value }))
  const allocation = [...byClass, { name: 'Cash & Equivalents', value: s.reserve }]

  const th = (key: SortKey, label: string, cls?: string) => (
    <th className={cx('sortable', cls)}
      onClick={() => setSort((p) => ({ key, dir: p.key === key && p.dir === -1 ? 1 : -1 }))}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={9} className={cx(sort.key === key ? 'text-cyan' : 'text-hair2')} />
      </span>
    </th>
  )

  return (
    <div className="flex flex-col gap-gutter min-h-0">

      {/* ══ SECTION: Portfolio Performance ═════════════════════════════════ */}
      <section>
        <h2 className="h2 mb-1">Portfolio Performance</h2>
        <p className="micro mb-3">Marked to last print · adjusted for fees and slippage</p>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Total Equity" value={usd(s.equity)} delta={dayPct} tone="neutral"
            tip="Cash plus mark-to-market value of open positions, net of accrued fees."
            sub={<>deployable <span className="num text-body">{usd(s.deployable)}</span></>} />
          <Stat label="Daily P&L" value={(dayPnl >= 0 ? '+' : '') + usd(dayPnl)}
            tone={dayPnl >= 0 ? 'up' : 'down'}
            tip="Realised plus unrealised P&L for the current session, gross of tax."
            sub={<>realised <span className="num text-body">{usd(s.realized_pnl)}</span> · unrealised <span className="num text-body">{usd(s.unrealized_pnl)}</span></>} />
          <Stat label="Gross Exposure" value={usd(grossExposure)} tone="neutral"
            tip="Sum of absolute notional across the open book. Not netted for offsetting risk."
            sub={<>{pct(s.equity > 0 ? grossExposure / s.equity : 0, 1)} of equity</>} />
          <Stat label="Cash & Equivalents" value={usd(s.reserve)} tone="cyan"
            tip="Swept reserve. Ring-fenced from the execution engine."
            sub="not available for deployment" />
          <Stat label="Projected Growth" value={signedPct(requiredReturn, 1)} tone="amber"
            tip="Return still required on current equity to reach the next ladder rung."
            sub={<>to reach <span className="num text-body">{usd(s.next_target, { compact: true })}</span> · gap {usd(toNext, { compact: true })}</>} />
          <Stat label="Drawdown Headroom" value={pct(headroom)}
            tone={headroom < 0.03 ? 'down' : headroom < 0.05 ? 'amber' : 'up'}
            tip="Distance to the nearest binding drawdown limit before the kill switch trips."
            sub={<>daily {pct(data.drawdown_headroom.daily, 1)} · rung {pct(data.drawdown_headroom.level, 1)}</>} />
        </div>
      </section>

      {/* ══ 70 / 30 ═══════════════════════════════════════════════════════ */}
      <div className="grid12 items-start">

        {/* ── LEFT: instrument + book ──────────────────────────────────── */}
        <div className="col-main flex flex-col gap-gutter min-w-0">

          <Panel title="Equity Curve"
            subtitle="Equity against the locked capital floor — the gap is what is actually at risk"
            right={
              <>
                <Segmented options={PERIODS} value={period} onChange={setPeriod} />
                <Badge tone={s.running ? 'live' : 'closed'}>
                  {s.running ? 'live' : 'paused'}
                </Badge>
              </>
            }>
            <div className="h-[300px]">
              {curve.length < 2 ? (
                <Empty>Collecting equity history — the curve needs a couple of ticks.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={curve} baseValue={yDomain[0]}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="rsv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="tick" stroke="#94A3B8" fontSize={10} minTickGap={28}
                      tickLine={false} axisLine={{ stroke: '#E2E8F0' }}
                      tickFormatter={(v) => `t${v}`} />
                    <YAxis stroke="#94A3B8" fontSize={10} width={64} tickLine={false}
                      axisLine={false} domain={yDomain} allowDataOverflow
                      tickFormatter={(v: number) => usd(v, { compact: true })} />
                    <RTooltip content={<CurveTip />} />
                    {targetInView && (
                      <ReferenceLine y={s.next_target} stroke="#F59E0B" strokeDasharray="4 3"
                        label={{ value: `next rung ${usd(s.next_target, { compact: true })}`,
                          fill: '#B45309', fontSize: 9, position: 'insideTopRight' }} />
                    )}
                    <Area type="monotone" dataKey="equity" stroke="#10B981" strokeWidth={2}
                      fill="url(#eq)" dot={false} name="equity" activeDot={{ r: 3, strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="floorLine" stroke="#2563EB" strokeWidth={1.5}
                      strokeDasharray="5 3" fill="url(#rsv)" dot={false} connectNulls={false}
                      name="locked floor" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-hair flex flex-wrap gap-x-6 gap-y-1">
              <Legend swatch="#10B981" label="Equity" />
              <Legend swatch="#2563EB" label="Locked floor (swept, non-deployable)" dashed />
              <Legend swatch="#F59E0B" label="Next rung target" dashed />
              <span className="micro ml-auto">{period} window · {curve.length} marks</span>
            </div>
          </Panel>

          <Panel title="Open Positions"
            subtitle="Kill-thesis proximity is the column that matters — a profitable position whose reason has evaporated is still a liability"
            right={<span className="micro num">{open.length} open · {usd(grossExposure, { compact: true })} gross</span>}
            pad={false} className="min-h-[280px]">
            {open.length === 0 ? (
              <Empty>No open positions. Capital deploys only when a thesis clears every risk gate.</Empty>
            ) : (
              <div className="overflow-auto max-h-[460px]">
                <table className="grid-table">
                  <thead>
                    <tr>
                      {th('instrument', 'Instrument')}
                      <th>Venue</th>
                      <th>Side</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Avg Cost</th>
                      <th className="text-right">Mark</th>
                      {th('size_usd', 'Notional', 'text-right')}
                      {th('unrealized_pnl', 'P&L', 'text-right')}
                      <th className="text-right">Chg</th>
                      {th('kill_proximity', 'Kill Prox.', 'w-[92px]')}
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p) => <Row key={p.id} p={p} />)}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-gutter py-2.5 border-t border-hair">
              <p className="micro">
                Quantity is derived from notional ÷ average cost. Prices are last mock print;
                P&amp;L is gross of tax and net of modelled fees and slippage.
              </p>
            </div>
          </Panel>

          <Panel title="Execution Engine Status"
            subtitle="Order and risk events on the bus, newest first"
            right={<span className="inline-flex items-center gap-1.5">
              <span className="live-dot" /><Radio size={11} className="text-muted" />
            </span>}
            pad={false} className="min-h-[240px]">
            {data.activity.length === 0 ? (
              <Empty>Bus is quiet. Order and risk events stream here as the engine runs.</Empty>
            ) : (
              <ul className="divide-y divide-hair/70 overflow-auto max-h-[340px]">
                {data.activity.map((a, i) => (
                  <li key={`${a.at}-${i}`} className="px-4 py-2.5 flex items-start gap-2.5 animate-ticker hover:bg-panel2 transition-colors">
                    <span className={cx('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0',
                      a.topic.includes('halt') || a.topic.includes('refused') ? 'bg-down'
                        : a.topic.includes('rejected') ? 'bg-amber'
                        : a.topic.includes('filled') || a.topic.includes('approved') ? 'bg-up' : 'bg-cyan')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-ink truncate">{titleize(a.topic)}</div>
                      <div className="micro truncate">
                        <span className="text-muted font-medium">{a.sender}</span>
                        {Object.entries(a.payload).slice(0, 2).map(([k, v]) => (
                          <span key={k} className="ml-1.5 num">
                            {k}=<span className="text-body">
                              {typeof v === 'number'
                                ? (Math.abs(v) < 1000 ? v.toFixed(4) : usd(v, { compact: true }))
                                : String(v).slice(0, 22)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="micro num shrink-0">{clock(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── RIGHT: risk dashboard ────────────────────────────────────── */}
        <div className="col-rail flex flex-col gap-gutter min-w-0">

          <Panel title="Risk Management Suite"
            subtitle="Headroom before the kill switch trips">
            <div className="grid grid-cols-2 gap-2">
              <Gauge value={Math.min(1, headroom / 0.08)} invert
                center={pct(headroom, 2)} label="Drawdown Headroom"
                sub={<>of an 8.00% cap</>} />
              <Gauge value={Math.min(1, s.equity > 0 ? var95 / (s.equity * 0.04) : 0)}
                center={usd(var95, { compact: true })} label="VaR (95%)"
                sub={<>vs a {pct(0.04, 0)} budget</>} />
            </div>
            <div className="mt-4 space-y-0">
              <KeyVal k="Session Sharpe" mono
                tip="Mean tick return ÷ standard deviation, scaled by √n over this session only."
                v={Number.isFinite(sharpe) ? sharpe.toFixed(2) : '—'} />
              <KeyVal k="Beta" mono tip="No benchmark series is wired in paper mode."
                v={<span className="text-faint">n/a</span>} />
              <KeyVal k="Gross exposure / equity" mono
                v={pct(s.equity > 0 ? grossExposure / s.equity : 0, 1)} />
              <KeyVal k="Daily loss limit used" mono
                v={pct(1 - Math.min(1, data.drawdown_headroom.daily / 0.08), 0)} />
              <KeyVal k="Kill switch" mono
                v={s.kill_tripped
                  ? <span className="text-down font-semibold">TRIPPED</span>
                  : <span className="text-up font-semibold">ARMED</span>} />
            </div>
            <p className="micro mt-3 pt-3 border-t border-hair">
              VaR is a parametric shorthand: 1.645σ on a {pct(VOL_ASSUMPTION, 1)} daily vol
              assumption applied to gross notional. It is an illustration, not a model output.
            </p>
          </Panel>

          <Panel title="Quick Actions" subtitle="Every route is gated — paper mode refuses at the adapter">
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-primary justify-center" disabled>Deploy Capital</button>
              <button className="btn btn-secondary justify-center" disabled>Rebalance</button>
              <button className="btn btn-secondary justify-center" disabled>Sweep to Reserve</button>
              <button className="btn btn-danger justify-center" disabled>Liquidate All</button>
            </div>
            <p className="micro mt-3">
              Disabled in simulation. Live routing requires a signed autonomy tier and
              per-venue credentials that this build does not hold.
            </p>
          </Panel>

          <Panel title="Risk Budget — Current Rung"
            subtitle={`Rung ${data.budget.node} · resets on every level-up`}>
            <Meter value={data.budget.max_deployable_usd > 0
              ? data.budget.deployed_usd / data.budget.max_deployable_usd : 0}
              label="Budget consumed"
              right={<span className="num text-2xs text-muted">
                {usd(data.budget.deployed_usd, { compact: true })} / {usd(data.budget.max_deployable_usd, { compact: true })}
              </span>} />
            <div className="mt-4 space-y-0">
              <KeyVal k="Remaining this rung" mono
                v={<span className="text-up">{usd(data.budget.remaining_usd)}</span>} />
              <KeyVal k="Realised loss this rung" mono
                v={<span className="text-down">{usd(data.budget.realized_loss_usd)}</span>} />
              <KeyVal k="Open positions" mono v={open.length} />
            </div>
            <p className="micro mt-3 pt-3 border-t border-hair">
              A rung cannot overspend even across trades that each pass their own limits — the
              coordinator decrements this budget on every fill and refuses what does not fit.
            </p>
          </Panel>

          <Panel title="Allocation by Asset Class"
            subtitle="Notional exposure plus ring-fenced cash">
            <Allocation items={allocation} />
          </Panel>

        </div>
      </div>
    </div>
  )
}

/* ── position row ─────────────────────────────────────────────────────────── */
function Row({ p }: { p: Position }) {
  const qty = p.entry_price > 0 ? p.size_usd / p.entry_price : 0
  const chg = p.entry_price > 0 ? (p.mark_price - p.entry_price) / p.entry_price : 0
  const long = p.direction === 'long' || p.direction === 'yes'
  const signedChg = long ? chg : -chg
  return (
    <tr>
      <td className="whitespace-nowrap max-w-[180px]">
        <div className="font-semibold text-ink truncate">{p.instrument}</div>
        <div className="micro">{p.correlation_group} · held {ago(p.opened_at)}</div>
      </td>
      <td><VenueTag v={p.venue} /></td>
      <td><Dir d={p.direction} /></td>
      <td className="text-right num">{qty.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
      <td className="text-right num text-muted">{price(p.entry_price)}</td>
      <td className="text-right num">{price(p.mark_price)}</td>
      <td className="text-right num">{usd(p.size_usd)}</td>
      <td className="text-right"><Pnl value={p.unrealized_pnl} /></td>
      <td className="text-right"><Delta value={signedChg} digits={2} /></td>
      <td>
        <Meter value={p.kill_proximity} danger={0.8} warn={0.5} />
        <div className={cx('num text-2xs mt-1 font-semibold',
          p.kill_proximity >= 0.8 ? 'text-down' : p.kill_proximity >= 0.5 ? 'text-amber' : 'text-muted')}>
          {pct(p.kill_proximity, 0)}
          {p.kill_proximity >= 0.8 && <span className="ml-1 font-normal">escalated</span>}
        </div>
      </td>
      <td className="text-right">
        <Tip text="Closing routes are disabled in paper mode.">
          <button className="btn btn-danger px-2 py-1 text-2xs" disabled>Close</button>
        </Tip>
      </td>
    </tr>
  )
}

/* ── chart tooltip: OHLC-style read on a single hover ─────────────────────── */
function CurveTip({ active, payload }: {
  active?: boolean; payload?: { payload: Record<string, number | string | null> }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as Record<string, number>
  return (
    <div className="rounded-card border border-hair bg-panel shadow-lift px-3 py-2 min-w-[190px]">
      <div className="label mb-1.5">Tick {d.tick}</div>
      <TipRow k="Open" v={usd(d.open)} />
      <TipRow k="Close" v={usd(d.equity)} strong />
      <TipRow k="High" v={usd(d.high)} />
      <TipRow k="Change" v={<Delta value={d.chg} digits={2} />} />
      <TipRow k="Locked floor" v={d.floorLine ? usd(d.floorLine) : '— none locked'} />
    </div>
  )
}

function TipRow({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-2xs py-0.5">
      <span className="text-muted">{k}</span>
      <span className={cx('num', strong ? 'text-ink font-semibold' : 'text-body')}>{v}</span>
    </div>
  )
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 micro">
      <span className="h-0.5 w-4 rounded-full shrink-0"
        style={dashed
          ? { backgroundImage: `repeating-linear-gradient(90deg,${swatch} 0 4px,transparent 4px 7px)` }
          : { background: swatch }} />
      {label}
    </span>
  )
}
