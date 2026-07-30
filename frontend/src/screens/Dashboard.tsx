import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Activity as ActIcon, AlertTriangle } from 'lucide-react'
import { Badge, Dir, Empty, Meter, Panel, Pnl, Stat, VenueTag, cx } from '../components/ui'
import { api } from '../lib/api'
import { ago, clock, pct, price, signedPct, titleize, usd } from '../lib/format'
import type { Dashboard as DashData } from '../lib/types'
import { usePolled } from '../lib/useLive'

/** Screen 2 — Command Dashboard. KPI row, equity curve, the open book with
 *  kill-thesis proximity per position, and the live agent feed. */
export default function Dashboard() {
  const { data } = usePolled<DashData>(api.dashboard, 1800)
  if (!data) return <Empty>Loading portfolio state…</Empty>

  const s = data.snapshot
  const open = data.positions.filter((p) => p.status === 'open')
  const dayPnl = s.realized_pnl + s.unrealized_pnl
  const toNext = Math.max(0, s.next_target - s.equity)

  // Pad the visible range by 8% of its span so the line isn't glued to an edge.
  // Scale to equity only. Before the first level-up the floor is $0, and
  // including it pins the axis to zero and flattens the line into a straight
  // edge. The floor series then simply clips below the visible range, which
  // reads correctly as "no floor locked in yet".
  const vals = data.equity_curve.map((p) => p.equity)
  const lo = Math.min(...vals, s.equity, ...data.equity_curve.map((p) => p.floor).filter((f) => f > 0))
  const hi = Math.max(...vals, s.equity)
  const pad = Math.max((hi - lo) * 0.35, hi * 0.02) || 0.01
  const yDomain: [number, number] = [Math.max(0, lo - pad), hi + pad]
  // Before the first level-up every floor reading is 0. Those zeros drag the
  // y-domain to zero even with an explicit domain, so null them out and let
  // Recharts skip the series until there is an actual floor to draw.
  const curve = data.equity_curve.map((p) => ({
    ...p, floorLine: p.floor > 0 ? p.floor : null,
  }))
  // Only draw the next-rung line when it is close enough to be meaningful;
  // otherwise it dominates the scale and hides the actual equity moves.
  const targetInView = s.next_target <= hi + pad * 3

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 shrink-0">
        <Stat label="Total equity" value={usd(s.equity)} tone="up"
          sub={<>deployable <span className="num">{usd(s.deployable)}</span></>} />
        <Stat label="P&L (run)" value={(dayPnl >= 0 ? '+' : '') + usd(dayPnl)}
          tone={dayPnl >= 0 ? 'up' : 'down'}
          sub={<>realized <span className="num">{usd(s.realized_pnl)}</span> · unreal <span className="num">{usd(s.unrealized_pnl)}</span></>} />
        <Stat label="Current node" value={`L${s.node}`} tone="cyan"
          sub={<>{pct(s.progress_pct, 1)} toward {usd(s.next_target, { compact: true })}</>} />
        <Stat label="Distance to double" value={usd(toNext)}
          sub={<>next rung <span className="num">{usd(s.next_target, { compact: true })}</span></>} />
        <Stat label="Protected reserve" value={usd(s.reserve)} tone="cyan"
          sub="agents cannot deploy this" />
        <Stat label="Drawdown headroom"
          value={pct(Math.min(data.drawdown_headroom.daily, data.drawdown_headroom.level))}
          tone={Math.min(data.drawdown_headroom.daily, data.drawdown_headroom.level) < 0.03 ? 'down' : 'amber'}
          sub={<>daily {pct(data.drawdown_headroom.daily, 1)} · level {pct(data.drawdown_headroom.level, 1)}</>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] shrink-0">
        <Panel title="Equity Curve"
          subtitle="Equity against the locked floor — the gap between the two lines is what is actually at risk"
          right={<Badge tone={s.running ? 'live' : 'closed'}>{s.running ? 'live' : 'paused'} · tick {s.tick}</Badge>}>
          <div className="h-[220px]">
            {data.equity_curve.length < 2 ? (
              <Empty>Collecting equity history — the curve needs a couple of ticks.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} baseValue={yDomain[0]}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00e59b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#00e59b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rsv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ea8ff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3ea8ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1b2438" vertical={false} />
                  <XAxis dataKey="tick" stroke="#4d5a75" fontSize={10} minTickGap={28}
                    tickLine={false} axisLine={{ stroke: '#1b2438' }} />
                  {/* Anchoring at zero flattens the curve into a straight line —
                      scale to the data with a little padding so moves are legible. */}
                  <YAxis stroke="#4d5a75" fontSize={10} width={58} tickLine={false}
                    axisLine={false} domain={yDomain} allowDataOverflow
                    tickFormatter={(v: number) => usd(v, { compact: true })} />
                  <Tooltip
                    contentStyle={{
                      background: '#0d1220', border: '1px solid #26314a',
                      borderRadius: 8, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                    }}
                    labelStyle={{ color: '#8593ad' }}
                    labelFormatter={(v) => `tick ${v}`}
                    formatter={(v, n) => [usd(Number(v)), titleize(String(n))]}
                  />
                  {targetInView && (
                    <ReferenceLine y={s.next_target} stroke="#f5a524" strokeDasharray="3 3"
                      label={{ value: `L${s.node + 1} target`, fill: '#f5a524', fontSize: 9, position: 'insideTopRight' }} />
                  )}
                  <Area type="monotone" dataKey="equity" stroke="#00e59b" strokeWidth={1.75}
                    fill="url(#eq)" dot={false} name="equity" />
                  <Area type="monotone" dataKey="floorLine" stroke="#3ea8ff" strokeWidth={1.25}
                    strokeDasharray="4 3" fill="url(#rsv)" dot={false} connectNulls={false}
                    name="locked floor" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="Per-Level Risk Budget"
          subtitle={`Node ${data.budget.node} — resets on every level-up`}>
          <div className="space-y-4">
            <Meter value={data.budget.max_deployable_usd > 0
              ? data.budget.deployed_usd / data.budget.max_deployable_usd : 0}
              label="Budget consumed"
              right={<span className="num text-2xs text-muted">
                {usd(data.budget.deployed_usd)} / {usd(data.budget.max_deployable_usd)}
              </span>} />
            <div className="space-y-1.5 text-2xs">
              <div className="flex justify-between"><span className="text-faint">Remaining this rung</span>
                <span className="num text-up">{usd(data.budget.remaining_usd)}</span></div>
              <div className="flex justify-between"><span className="text-faint">Realized loss this rung</span>
                <span className="num text-down">{usd(data.budget.realized_loss_usd)}</span></div>
              <div className="flex justify-between"><span className="text-faint">Open positions</span>
                <span className="num text-ink">{open.length}</span></div>
            </div>
            <p className="text-2xs text-faint leading-relaxed pt-1 border-t border-hair">
              A rung cannot overspend even across trades that each pass their own limits —
              the Coordinator decrements this budget on every fill and refuses what does not fit.
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] min-h-0">
        <Panel title="Open Book" subtitle="Kill-thesis proximity is the column that matters — a green position whose reason has evaporated is still a liability"
          pad={false} className="min-h-[260px]">
          {open.length === 0 ? (
            <Empty>No open positions. The Coordinator only deploys when a thesis clears every Guardian check.</Empty>
          ) : (
            <div className="overflow-auto max-h-[420px]">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Instrument</th><th>Venue</th><th>Dir</th>
                    <th className="text-right">Size</th><th className="text-right">Entry</th>
                    <th className="text-right">Mark</th><th className="text-right">P&L</th>
                    <th className="w-[132px]">Kill proximity</th><th className="text-right">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium text-ink whitespace-nowrap">
                        {p.instrument}
                        <div className="text-2xs text-faint">{p.correlation_group}</div>
                      </td>
                      <td><VenueTag v={p.venue} /></td>
                      <td><Dir d={p.direction} /></td>
                      <td className="text-right num">{usd(p.size_usd)}
                        <div className="text-2xs text-faint num">{pct(p.size_usd / (p.deployable_at_entry || 1), 1)} at entry</div>
                      </td>
                      <td className="text-right num text-muted">{price(p.entry_price)}</td>
                      <td className="text-right num">{price(p.mark_price)}</td>
                      <td className="text-right"><Pnl value={p.unrealized_pnl} />
                        <div className="text-2xs num text-faint">
                          {signedPct(p.size_usd > 0 ? p.unrealized_pnl / p.size_usd : 0, 1)}
                        </div>
                      </td>
                      <td>
                        <Meter value={p.kill_proximity} danger={0.8} warn={0.5} />
                        <div className={cx('num text-2xs mt-1',
                          p.kill_proximity >= 0.8 ? 'text-down' : p.kill_proximity >= 0.5 ? 'text-amber' : 'text-faint')}>
                          {pct(p.kill_proximity, 0)}
                          {p.kill_proximity >= 0.8 && <span className="ml-1">escalated</span>}
                        </div>
                      </td>
                      <td className="text-right num text-faint">{ago(p.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Agent Activity" subtitle="Every message on the bus, newest first"
          right={<ActIcon size={12} className="text-up" />} pad={false} className="min-h-[260px]">
          {data.activity.length === 0 ? (
            <Empty>The bus is quiet. Agents publish here as the pipeline runs.</Empty>
          ) : (
            <ul className="divide-y divide-hair/40 overflow-auto max-h-[420px]">
              {data.activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="px-4 py-2 flex items-start gap-2.5 animate-ticker">
                  <span className={cx('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0',
                    a.topic.includes('halt') || a.topic.includes('refused') ? 'bg-down'
                      : a.topic.includes('rejected') ? 'bg-amber'
                      : a.topic.includes('filled') || a.topic.includes('approved') ? 'bg-up' : 'bg-cyan')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-ink truncate">
                      {a.topic.includes('halt') && <AlertTriangle size={10} className="inline text-down mr-1 -mt-0.5" />}
                      {titleize(a.topic)}
                    </div>
                    <div className="text-2xs text-faint truncate">
                      <span className="text-muted">{a.sender}</span>
                      {Object.entries(a.payload).slice(0, 2).map(([k, v]) => (
                        <span key={k} className="ml-1.5 num">
                          {k}=<span className="text-muted">
                            {typeof v === 'number' ? (Math.abs(v) < 1000 ? v.toFixed(4) : usd(v, { compact: true })) : String(v).slice(0, 22)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-2xs num text-faint shrink-0">{clock(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
