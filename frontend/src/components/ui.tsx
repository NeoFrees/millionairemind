import { type ReactNode } from 'react'
import clsx from 'clsx'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { pct, signedPct, signedUsd, usd } from '../lib/format'

export const cx = clsx

/* ────────────────────────────────────────────────────────────────────────────
 * FrameCorners — four 1px L-bracket ticks outside a panel's edge. Reserved
 * for the headline instrument on a screen (equity curve, risk suite) so it
 * reads as "the one to watch," not decoration repeated on every card.
 * ──────────────────────────────────────────────────────────────────────────── */
export function FrameCorners({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('frame-corners', className)}>
      <span className="fc-tr" /><span className="fc-bl" />
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Eyebrow — numbered micro-label above a section header, Bloomberg-style
 * dense labelling: "01 · PORTFOLIO PERFORMANCE".
 * ──────────────────────────────────────────────────────────────────────────── */
export function Eyebrow({ index, children }: { index: string | number; children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="eyebrow-index">{index}</span>
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sparkline — inline trend line for a KPI tile. No axes, no gridlines, just
 * the line and a terminal dot in the same tone as the headline delta.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Sparkline({
  data, tone = 'up', width = 88, height = 28,
}: { data: number[]; tone?: 'up' | 'down' | 'neutral'; width?: number; height?: number }) {
  if (data.length < 2) return null
  const stroke = tone === 'up' ? '#10B981' : tone === 'down' ? '#EF4444' : '#64748B'
  const points = data.map((v, i) => ({ i, v }))
  const lo = Math.min(...data), hi = Math.max(...data)
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1
  return (
    <div style={{ width, height }} className="shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 1, left: 1, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[lo - pad, hi + pad]} />
          <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5}
            fill={`url(#spark-${tone})`} dot={false}
            isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Candle — real OHLC candlesticks, built the way Recharts documents them:
 * range-value bars. `wick` and `body` each resolve to a [min, max] tuple,
 * which Recharts renders as a floating bar rather than one based at zero.
 * No custom shape reading chart-internal axis state — just two Bars.
 * ──────────────────────────────────────────────────────────────────────────── */
export interface Candle {
  label: string | number; open: number; close: number; high: number; low: number
  up: boolean; wick: [number, number]; body: [number, number]
}

export const toCandle = (label: string | number, open: number, close: number, high: number, low: number): Candle => ({
  label, open, close, high, low, up: close >= open,
  wick: [low, high], body: [Math.min(open, close), Math.max(open, close)],
})

/* ────────────────────────────────────────────────────────────────────────────
 * Tooltip — every number on the desk should be able to explain itself.
 * CSS-driven (no portal, no state) so it works inside table cells and charts.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Tip({ children, text }: { children: ReactNode; text: ReactNode }) {
  return (
    <span className="tip" tabIndex={0}>
      {children}
      <span className="tip-body" role="tooltip">{text}</span>
    </span>
  )
}

/** Micro-copy: "as of T+1 close", "adjusted for fees, gross of tax". */
export function Micro({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('micro', className)}>{children}</p>
}

/* ────────────────────────────────────────────────────────────────────────────
 * Panel — the one card. White surface, 8px radius, single elevation, 24px pad.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Panel({
  title, right, children, className, pad = true, subtitle, dense = false,
}: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode
  className?: string; pad?: boolean; dense?: boolean
}) {
  return (
    <section className={cx('panel panel-hover flex flex-col overflow-hidden', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-gutter py-3 border-b border-hair shrink-0">
          <div className="min-w-0">
            <h2 className="h2 truncate">{title}</h2>
            {subtitle && <p className="micro truncate mt-0.5">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', pad && (dense ? 'p-gutter2' : 'p-gutter'), !pad && 'overflow-auto')}>
        {children}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Delta — the "▲ +4.8%" / "▼ -1.2%" glyph. Direction is carried by shape as
 * well as colour, so it survives colour-blindness and greyscale print.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Delta({
  value, digits = 2, absolute, className,
}: { value: number; digits?: number; absolute?: number; className?: string }) {
  if (!Number.isFinite(value)) return <span className="num text-muted">—</span>
  const flat = Math.abs(value) < 1e-9
  return (
    <span className={cx('num text-2xs font-semibold inline-flex items-center gap-1',
      flat ? 'text-muted' : value > 0 ? 'text-up' : 'text-down', className)}>
      <span aria-hidden>{flat ? '▬' : value > 0 ? '▲' : '▼'}</span>
      {signedPct(value, digits)}
      {absolute !== undefined && (
        <span className="text-faint font-normal">({signedUsd(absolute)})</span>
      )}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stat — a tape/KPI tile. Monospaced value, optional delta, micro-copy footer.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Stat({
  label, value, sub, tone = 'neutral', mono = true, delta, tip, footnote, spark,
}: {
  label: string; value: string; sub?: ReactNode; delta?: number; tip?: ReactNode
  footnote?: string; spark?: number[]
  tone?: 'neutral' | 'up' | 'down' | 'amber' | 'cyan'; mono?: boolean
}) {
  const tones = {
    neutral: 'text-ink', up: 'text-up', down: 'text-down',
    amber: 'text-amber', cyan: 'text-cyan',
  }
  const head = (
    <div className="label flex items-center gap-1">
      {label}
      {tip && <span className="text-hair2" aria-hidden>ⓘ</span>}
    </div>
  )
  return (
    <div className="panel panel-hover px-gutter py-3.5">
      <div className="flex items-start justify-between gap-2">
        {tip ? <Tip text={tip}>{head}</Tip> : head}
        {spark && spark.length > 1 && (
          <Sparkline data={spark} tone={delta === undefined ? 'neutral' : delta >= 0 ? 'up' : 'down'} />
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className={cx('text-xl font-semibold', mono && 'num', tones[tone])}>{value}</span>
        {delta !== undefined && <Delta value={delta} digits={1} />}
      </div>
      {sub && <div className="mt-1.5 micro">{sub}</div>}
      {footnote && <div className="mt-2 pt-2 border-t border-hair micro">{footnote}</div>}
    </div>
  )
}

export function Pnl({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('num font-medium', value > 0 && 'text-up', value < 0 && 'text-down',
      value === 0 && 'text-muted', className)}>
      {signedUsd(value)}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Meter — linear utilization. Colour is a function of proximity to the limit;
 * a bar at 95% must not feel like a bar at 20%.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Meter({
  value, label, right, danger = 0.85, warn = 0.6,
}: { value: number; label?: string; right?: ReactNode; danger?: number; warn?: number }) {
  const v = Math.max(0, Math.min(1, value))
  const tone = v >= danger ? 'bg-down' : v >= warn ? 'bg-amber' : 'bg-up'
  return (
    <div>
      {(label || right) && (
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          {label && <span className="text-xs text-body truncate">{label}</span>}
          {right}
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-hair overflow-hidden">
        <div className={cx('h-full rounded-full transition-all duration-700', tone)}
          style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Gauge — radial dial for headroom-style metrics (drawdown headroom, VaR use).
 * `value` is the fraction of the arc filled; `invert` flips the colour logic so
 * "more remaining = greener" reads correctly for headroom.
 * ──────────────────────────────────────────────────────────────────────────── */
export function Gauge({
  value, center, label, sub, size = 132, invert = false, warn = 0.5, danger = 0.375,
}: {
  value: number; center: string; label?: string; sub?: ReactNode
  size?: number; invert?: boolean; warn?: number; danger?: number
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // 270° sweep, opening at the bottom — a dial, not a donut
  const sweep = 0.75
  const tone = invert
    ? (v <= danger ? '#EF4444' : v <= warn ? '#F59E0B' : '#10B981')
    : (v >= 1 - danger ? '#EF4444' : v >= 1 - warn ? '#F59E0B' : '#10B981')
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size * 0.82 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0" style={{ transform: 'rotate(135deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0"
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * sweep} ${c}`} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * sweep * v} ${c}`}
            style={{ transition: 'stroke-dasharray 700ms ease, stroke 400ms ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pt-1">
          <span className="num text-lg font-semibold" style={{ color: tone }}>{center}</span>
        </div>
      </div>
      {label && <span className="label mt-0.5 text-center leading-tight px-1">{label}</span>}
      {sub && <div className="micro text-center mt-0.5">{sub}</div>}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Allocation — horizontal 100% bar + legend rows. Replaces "4 positions" with
 * an actual read on where the capital sits.
 * ──────────────────────────────────────────────────────────────────────────── */
// amber is reserved for 'not real money' warnings — never an allocation colour
const ALLOC_COLORS = ['#0F172A', '#2563EB', '#10B981', '#6366F1', '#64748B', '#94A3B8']

export function Allocation({
  items, total, unit = 'usd',
}: { items: { name: string; value: number }[]; total?: number; unit?: 'usd' | 'pct' }) {
  const sum = total ?? items.reduce((a, b) => a + b.value, 0)
  if (sum <= 0) return <Empty>No allocation to display yet.</Empty>
  const rows = [...items].sort((a, b) => b.value - a.value)
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-hair">
        {rows.map((r, i) => (
          <div key={r.name}
            className="h-3 first:rounded-l-full last:rounded-r-full transition-all duration-700"
            title={`${r.name} — ${usd(r.value)} (${pct(r.value / sum, 1)})`}
            style={{ width: `${(r.value / sum) * 100}%`, minWidth: 2,
              background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
        ))}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-sm shrink-0"
              style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
            <span className="text-body truncate">{r.name}</span>
            <span className="ml-auto num text-muted shrink-0">
              {unit === 'usd' ? usd(r.value, { compact: true }) : pct(r.value, 1)}
            </span>
            <span className="num text-ink font-semibold w-12 text-right shrink-0">
              {pct(r.value / sum, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── segmented time-period control ────────────────────────────────────────── */
export function Segmented<T extends string>({
  options, value, onChange,
}: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o} type="button" role="tab" data-active={o === value}
          aria-selected={o === value} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  )
}

const TONE_MAP: Record<string, string> = {
  live: 'border-up/45 text-upDim bg-up/[0.10]',
  approved: 'border-up/45 text-upDim bg-up/[0.10]',
  filled: 'border-up/45 text-upDim bg-up/[0.10]',
  open: 'border-up/45 text-upDim bg-up/[0.10]',
  settled: 'border-up/45 text-upDim bg-up/[0.10]',
  high: 'border-up/45 text-upDim bg-up/[0.10]',
  under_review: 'border-cyan/45 text-cyan bg-cyan/[0.08]',
  proposed: 'border-cyan/45 text-cyan bg-cyan/[0.08]',
  pending: 'border-amber/50 text-[#B45309] bg-amber/[0.10]',
  pending_approval: 'border-amber/50 text-[#B45309] bg-amber/[0.10]',
  medium: 'border-amber/50 text-[#B45309] bg-amber/[0.10]',
  partial: 'border-amber/50 text-[#B45309] bg-amber/[0.10]',
  rejected: 'border-down/45 text-down bg-down/[0.08]',
  failed: 'border-down/45 text-down bg-down/[0.08]',
  cancelled: 'border-down/45 text-down bg-down/[0.08]',
  low: 'border-hair2 text-muted',
  closed: 'border-hair2 text-muted',
}

export function Badge({ children, tone, className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cx('chip', tone && TONE_MAP[tone], className)}>{children}</span>
}

export function Dir({ d }: { d: string }) {
  const up = d === 'long' || d === 'yes'
  return (
    <span className={cx('num text-2xs font-bold px-1.5 py-0.5 rounded border',
      up ? 'text-upDim bg-up/[0.10] border-up/35' : 'text-down bg-down/[0.08] border-down/30')}>
      {d.toUpperCase()}
    </span>
  )
}

export function VenueTag({ v }: { v: string }) {
  const map: Record<string, string> = {
    polymarket: 'text-violet border-violet/35 bg-violet/[0.07]',
    crypto: 'text-[#B45309] border-amber/40 bg-amber/[0.08]',
    equities: 'text-cyan border-cyan/40 bg-cyan/[0.07]',
    banking: 'text-muted border-hair2',
  }
  return <span className={cx('chip', map[v] ?? 'border-hair2')}>{v}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-[120px] grid place-items-center text-center px-6">
      <p className="text-xs text-faint max-w-sm leading-relaxed">{children}</p>
    </div>
  )
}

export function KeyVal({ k, v, mono, tip }: { k: string; v: ReactNode; mono?: boolean; tip?: ReactNode }) {
  const key = <span className="text-2xs text-muted shrink-0">{k}</span>
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-hair/70 last:border-0">
      {tip ? <Tip text={tip}>{key}</Tip> : key}
      <span className={cx('text-xs text-ink text-right font-medium', mono && 'num')}>{v}</span>
    </div>
  )
}

export function LimitRow({ name, used, limit, ratio }: { name: string; used: number; limit: number; ratio: number }) {
  return (
    <div className="py-2.5 border-b border-hair/70 last:border-0">
      <Meter
        value={ratio}
        label={name}
        right={
          <span className="num text-2xs text-muted shrink-0">
            {usd(used, { compact: true })} <span className="text-faint">/ {usd(limit, { compact: true })}</span>
            <span className={cx('ml-2 font-semibold',
              ratio >= 0.85 ? 'text-down' : ratio >= 0.6 ? 'text-amber' : 'text-up')}>
              {pct(ratio, 0)}
            </span>
          </span>
        }
      />
    </div>
  )
}
