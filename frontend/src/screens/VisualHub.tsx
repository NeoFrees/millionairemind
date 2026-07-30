import { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip,
  Treemap, XAxis, YAxis,
} from 'recharts'
import {
  Allocation, Badge, Delta, Empty, Eyebrow, FrameCorners, Gauge, KeyVal, Panel, Pnl,
  Segmented, Tip, cx,
} from '../components/ui'
import { pct, price, titleize, usd } from '../lib/format'
import { demoDashboard } from '../lib/demo'
import type { Position } from '../lib/types'

const PERIODS = ['1D', '1W', '1M', 'YTD'] as const
// amber is reserved for 'not real money' warnings — it is not an allocation colour
const CLASS_COLORS = ['#0F172A', '#2563EB', '#10B981', '#6366F1', '#64748B', '#94A3B8']

/** Screen 6 — Portfolio Performance & Attribution.
 *  Replaces the decorative 3D deck with two instruments that a desk actually
 *  reads: an allocation treemap and a reconstructed order book. */
export default function VisualHub() {
  const dash = demoDashboard
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('1D')
  const open = dash.positions.filter((p) => p.status === 'open')
  const s = dash.snapshot

  const gross = open.reduce((a, p) => a + p.size_usd, 0)

  // ── allocation by asset class, cash included ──────────────────────────────
  const byClass = useMemo(() => {
    const m = open.reduce<Record<string, number>>((acc, p) => {
      acc[titleize(p.venue)] = (acc[titleize(p.venue)] ?? 0) + p.size_usd
      return acc
    }, {})
    return [...Object.entries(m).map(([name, value]) => ({ name, value })),
      { name: 'Cash & Equivalents', value: s.reserve }]
  }, [open, s.reserve])

  const treemapData = byClass.map((d, i) => ({
    ...d, fill: CLASS_COLORS[i % CLASS_COLORS.length],
    share: d.value / byClass.reduce((a, b) => a + b.value, 0),
  }))

  // ── attribution: P&L contribution per position ────────────────────────────
  const attribution = useMemo(
    () => [...open]
      .map((p) => ({ name: p.instrument.slice(0, 22), pnl: p.unrealized_pnl, notional: p.size_usd }))
      .sort((a, b) => b.pnl - a.pnl),
    [open],
  )

  // ── order book: bus events reconstructed as an execution log ──────────────
  const book = useMemo(() => dash.activity.map((a, i) => {
    const size = typeof a.payload.size === 'number' ? a.payload.size
      : typeof a.payload.amount === 'number' ? a.payload.amount : null
    const filled = a.topic.includes('filled')
    const refused = a.topic.includes('refused') || a.topic.includes('halt')
    const rejected = a.topic.includes('rejected')
    return {
      id: 4921 - i,
      at: a.at,
      side: filled ? 'BUY' : refused || rejected ? 'CXL' : 'INFO',
      agent: a.sender,
      event: titleize(a.topic),
      size,
      status: filled ? 'filled' : refused ? 'refused' : rejected ? 'rejected' : 'ack',
    }
  }), [dash.activity])

  return (
    <div className="flex flex-col gap-gutter">

      {/* ══ SECTION: Allocation ═══════════════════════════════════════════ */}
      <section>
        <Eyebrow index="01">Risk Exposure by Asset Class</Eyebrow>
        <p className="micro mb-3">Notional weights, cash included · as of last mark</p>

        <div className="grid12 items-start">
          <FrameCorners className="col-main min-w-0">
          <Panel title="Allocation Treemap"
            subtitle="Area is proportional to notional weight"
            right={<Segmented options={PERIODS} value={period} onChange={setPeriod} />}
            pad={false}>
            <div className="h-[320px] p-3">
              {treemapData.length === 0 ? <Empty>No allocation to display.</Empty> : (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap data={treemapData} dataKey="value" stroke="#FFFFFF"
                    isAnimationActive={false} content={<Cellish />}>
                    <RTooltip content={<AllocTip />} />
                  </Treemap>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
          </FrameCorners>

          <div className="col-rail flex flex-col gap-gutter min-w-0">
            <Panel title="Weights" subtitle="Sorted by notional">
              <Allocation items={byClass} />
            </Panel>
          </div>
        </div>
      </section>

      {/* ══ SECTION: Attribution + order book ════════════════════════════ */}
      <section>
      <Eyebrow index="02">Attribution & Order Flow</Eyebrow>
      <div className="grid12 items-start">
        <Panel className="col-main min-w-0" title="P&L Attribution"
          subtitle="Unrealised contribution by position · adjusted for modelled fees" pad={false}>
          <div className="h-[300px] p-3">
            {attribution.length === 0 ? <Empty>No positions to attribute.</Empty> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attribution} layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" stroke="#94A3B8" fontSize={10} tickLine={false}
                    axisLine={false} tickFormatter={(v) => usd(Number(v), { compact: true })} />
                  <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={10}
                    width={150} tickLine={false} axisLine={false} />
                  <RTooltip content={<AttribTip />} />
                  <Bar dataKey="pnl" barSize={16} radius={[0, 3, 3, 0]}>
                    {attribution.map((d) => (
                      <Cell key={d.name} fill={d.pnl >= 0 ? '#10B981' : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="col-rail min-w-0" title="Real-Time Order Book"
          subtitle="Execution and risk events, newest first"
          right={<span className="live-dot" />} pad={false}>
          <div className="overflow-auto max-h-[300px]">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Time</th><th>Order</th><th>Side</th>
                  <th className="text-right">Size</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {book.map((o) => (
                  <tr key={o.id}>
                    <td className="num text-muted whitespace-nowrap">
                      {new Date(o.at).toLocaleTimeString('en-US', { hour12: true })}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="num text-ink font-semibold">#{o.id}</span>
                      <div className="micro truncate max-w-[130px]">{o.event} · {o.agent}</div>
                    </td>
                    <td>
                      <span className={cx('num text-2xs font-bold px-1.5 py-0.5 rounded border',
                        o.side === 'BUY' ? 'text-upDim bg-up/[0.10] border-up/35'
                          : o.side === 'CXL' ? 'text-down bg-down/[0.08] border-down/30'
                          : 'text-muted border-hair2')}>{o.side}</span>
                    </td>
                    <td className="text-right num">
                      {o.size !== null ? usd(o.size, { compact: true }) : <span className="text-faint">—</span>}
                    </td>
                    <td><Badge tone={o.status}>{o.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-hair">
            <p className="micro">
              Reconstructed from the internal message bus. Order IDs are synthetic — paper mode
              never reaches a venue matching engine.
            </p>
          </div>
        </Panel>
      </div>
      </section>

      {/* ══ SECTION: correlation exposure ═══════════════════════════════ */}
      <section>
      <Eyebrow index="03">Correlation & Concentration</Eyebrow>
      <div className="grid12 items-start">
        <Panel className="col-main min-w-0" title="Correlation Exposure Matrix"
          subtitle="Shared correlation-group flag between open positions — a same-group flag, not a fitted coefficient"
          pad={false}>
          <CorrelationMatrix positions={open} />
          <div className="px-4 py-2.5 border-t border-hair">
            <p className="micro">
              This reads book structure, not statistics: cells mark whether two positions share a
              correlation group (from the pre-trade risk check), not a fitted return correlation.
              Two names can be numerically correlated without sharing a group, or vice versa.
            </p>
          </div>
        </Panel>

        <div className="col-rail flex flex-col gap-gutter min-w-0">
          <Panel title="Concentration" subtitle="Single-name and single-class limits">
            <div className="grid grid-cols-2 gap-2">
              <Gauge size={120}
                value={gross > 0 ? Math.max(...open.map((p) => p.size_usd)) / gross : 0}
                center={pct(gross > 0 ? Math.max(...open.map((p) => p.size_usd)) / gross : 0, 0)}
                label="Largest position" sub={<>of gross exposure</>} />
              <Gauge size={120}
                value={s.equity > 0 ? gross / s.equity : 0}
                center={pct(s.equity > 0 ? gross / s.equity : 0, 0)}
                label="Gross / equity" sub={<>leverage proxy</>} />
            </div>
            <p className="micro mt-3 pt-3 border-t border-hair">
              Concentration is measured on notional, not risk-adjusted contribution — read it
              next to the matrix on the left, not in isolation: two positions can look
              diversified here and still share a correlation group.
            </p>
          </Panel>
        </div>
      </div>
      </section>

      {/* ══ SECTION: position detail ═════════════════════════════════════ */}
      <Eyebrow index="04">Position Detail & Liquidity</Eyebrow>
      <Panel title="Position Detail" subtitle="Marks, levels and exits per open position" pad={false}>
        <div className="overflow-auto">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Instrument</th><th>Class</th>
                <th className="text-right">Notional</th><th className="text-right">Weight</th>
                <th className="text-right">Avg. Cost</th><th className="text-right">Mark</th>
                <th className="text-right">Stop</th><th className="text-right">Target</th>
                <th className="text-right">P&L</th><th className="text-right">% Change</th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => {
                const chg = p.entry_price > 0 ? (p.mark_price - p.entry_price) / p.entry_price : 0
                const long = p.direction === 'long' || p.direction === 'yes'
                return (
                  <tr key={p.id}>
                    <td className="font-semibold text-ink max-w-[260px] truncate">{p.instrument}</td>
                    <td className="text-muted">{titleize(p.venue)}</td>
                    <td className="text-right num">{usd(p.size_usd)}</td>
                    <td className="text-right num">{pct(gross > 0 ? p.size_usd / gross : 0, 1)}</td>
                    <td className="text-right num text-muted">{price(p.entry_price)}</td>
                    <td className="text-right num">{price(p.mark_price)}</td>
                    <td className="text-right num text-down">{price(p.stop)}</td>
                    <td className="text-right num text-up">{price(p.target)}</td>
                    <td className="text-right"><Pnl value={p.unrealized_pnl} /></td>
                    <td className="text-right"><Delta value={long ? chg : -chg} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ══ SECTION: cash breakdown ══════════════════════════════════════ */}
      <div className="grid12 items-start">
        <Panel className="col-rail min-w-0" title="Cash & Equivalents"
          subtitle="Ring-fenced reserve — not deployable by the engine">
          <KeyVal k="Cash" mono v={usd(Math.round(s.reserve * 0.876))} />
          <KeyVal k="Money market" mono v={usd(Math.round(s.reserve * 0.077))} />
          <KeyVal k="T-Bills (≤ 3m)" mono v={usd(s.reserve - Math.round(s.reserve * 0.876) - Math.round(s.reserve * 0.077))} />
          <div className="mt-3 pt-3 border-t border-hair flex items-baseline justify-between">
            <span className="label">Total</span>
            <span className="num text-sm font-semibold text-ink">{usd(s.reserve)}</span>
          </div>
          <p className="micro mt-3">
            Sleeve split is illustrative — paper mode holds a single internal cash balance.
          </p>
        </Panel>

        <Panel className="col-main min-w-0" title="Projected Growth"
          subtitle="Return still required on current equity to clear the next rung">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="num text-2xl font-semibold text-ink">{usd(s.equity)}</span>
            <span className="text-muted text-xs">→</span>
            <span className="num text-2xl font-semibold text-cyan">{usd(s.next_target)}</span>
            <Tip text="Gap ÷ current equity. No time estimate is implied — path and pace are not modelled.">
              <span className="chip chip-paper ml-1">
                needs {pct(Math.max(0, (s.next_target - s.equity) / s.equity), 1)}
              </span>
            </Tip>
          </div>
          <div className="mt-4">
            <div className="h-2.5 w-full rounded-full bg-hair overflow-hidden">
              <div className="h-full rounded-full bg-cyan transition-all duration-700"
                style={{ width: `${Math.min(100, s.progress_pct * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between micro num">
              <span>{pct(s.progress_pct, 1)} of rung complete</span>
              <span>gap {usd(Math.max(0, s.next_target - s.equity))}</span>
            </div>
          </div>
          <p className="micro mt-4 pt-3 border-t border-hair">
            Required return is arithmetic, not a forecast. Nothing on this panel projects a
            timeline, and a rung can regress as easily as it advances.
          </p>
        </Panel>
      </div>
    </div>
  )
}

/* ── treemap cell renderer ────────────────────────────────────────────────── */
/* ── correlation exposure matrix: shared-group flag, not a fitted coefficient ── */
function CorrelationMatrix({ positions }: { positions: Position[] }) {
  if (positions.length < 2) {
    return <Empty>Need at least two open positions to compare correlation groups.</Empty>
  }
  const short = (s: string) => (s.length > 13 ? `${s.slice(0, 12)}…` : s)
  return (
    <div className="overflow-auto p-3">
      <table className="grid-table" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className="w-[150px]">Position</th>
            {positions.map((p) => (
              <th key={p.id} className="text-center w-[64px]" title={p.instrument}>{short(p.instrument)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((row) => (
            <tr key={row.id}>
              <td className="font-semibold text-ink whitespace-nowrap">
                {short(row.instrument)}
                <div className="micro">{row.correlation_group}</div>
              </td>
              {positions.map((col) => {
                const self = row.id === col.id
                const same = !self && row.correlation_group === col.correlation_group
                return (
                  <td key={col.id} className="text-center p-1.5">
                    <Tip text={self ? 'Same position'
                      : same ? <>Shared correlation group — <span className="text-ink">{row.correlation_group}</span></>
                      : 'No shared correlation group'}>
                      <div className={cx('mx-auto h-7 w-7 rounded-[4px] grid place-items-center num text-2xs font-bold',
                        self ? 'bg-ink text-white'
                          : same ? 'bg-down/[0.14] text-down border border-down/30'
                          : 'bg-panel2 text-faint border border-hair')}>
                        {self ? '—' : same ? '●' : '·'}
                      </div>
                    </Tip>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-4 px-1 pt-1">
        <span className="inline-flex items-center gap-1.5 micro">
          <span className="h-3 w-3 rounded-[3px] bg-down/[0.14] border border-down/30" /> shared group
        </span>
        <span className="inline-flex items-center gap-1.5 micro">
          <span className="h-3 w-3 rounded-[3px] bg-panel2 border border-hair" /> independent
        </span>
        <span className="inline-flex items-center gap-1.5 micro">
          <span className="h-3 w-3 rounded-[3px] bg-ink" /> self
        </span>
      </div>
    </div>
  )
}

function Cellish(props: Record<string, unknown>) {
  const x = props.x as number, y = props.y as number
  const w = props.width as number, h = props.height as number
  const name = props.name as string | undefined
  const fill = (props.fill as string) ?? '#0F172A'
  const value = props.value as number
  if (!name || w < 2 || h < 2) return null
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#FFFFFF" strokeWidth={2} rx={4} />
      {w > 78 && h > 40 && (
        <>
          <text x={x + 10} y={y + 20} fill="#FFFFFF" fontSize={11} fontWeight={600}>
            {name.length > 18 ? `${name.slice(0, 17)}…` : name}
          </text>
          <text x={x + 10} y={y + 36} fill="rgba(255,255,255,0.78)" fontSize={11}
            fontFamily="JetBrains Mono, monospace">
            {usd(value, { compact: true })}
          </text>
        </>
      )}
    </g>
  )
}

function AllocTip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number | string> }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { name: string; value: number; share: number }
  return (
    <div className="rounded-card border border-hair bg-panel shadow-lift px-3 py-2">
      <div className="label mb-1">{d.name}</div>
      <div className="num text-xs text-ink font-semibold">{usd(d.value)}</div>
      <div className="micro num">{pct(d.share, 1)} of portfolio</div>
    </div>
  )
}

function AttribTip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number | string> }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { name: string; pnl: number; notional: number }
  return (
    <div className="rounded-card border border-hair bg-panel shadow-lift px-3 py-2 min-w-[170px]">
      <div className="label mb-1.5">{d.name}</div>
      <div className="flex justify-between gap-4 text-2xs py-0.5">
        <span className="text-muted">Unrealised P&L</span><Pnl value={d.pnl} />
      </div>
      <div className="flex justify-between gap-4 text-2xs py-0.5">
        <span className="text-muted">Notional</span>
        <span className="num text-body">{usd(d.notional)}</span>
      </div>
      <div className="flex justify-between gap-4 text-2xs py-0.5">
        <span className="text-muted">Return on notional</span>
        <Delta value={d.notional > 0 ? d.pnl / d.notional : 0} />
      </div>
    </div>
  )
}
