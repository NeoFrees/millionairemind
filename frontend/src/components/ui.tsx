import { type ReactNode } from 'react'
import clsx from 'clsx'
import { pct, signedUsd, usd } from '../lib/format'

export const cx = clsx

export function Panel({
  title, right, children, className, pad = true, subtitle,
}: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode
  className?: string; pad?: boolean
}) {
  return (
    <section className={cx('panel flex flex-col overflow-hidden', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-hair shrink-0">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold tracking-wide text-ink truncate">{title}</h2>
            {subtitle && <p className="text-2xs text-faint truncate mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', pad && 'p-4', !pad && 'overflow-auto')}>{children}</div>
    </section>
  )
}

export function Stat({
  label, value, sub, tone = 'neutral', mono = true,
}: {
  label: string; value: string; sub?: ReactNode
  tone?: 'neutral' | 'up' | 'down' | 'amber' | 'cyan'; mono?: boolean
}) {
  const tones = {
    neutral: 'text-ink', up: 'text-up', down: 'text-down',
    amber: 'text-amber', cyan: 'text-cyan',
  }
  return (
    <div className="panel px-4 py-3">
      <div className="label">{label}</div>
      <div className={cx('mt-1.5 text-xl font-semibold', mono && 'num', tones[tone])}>{value}</div>
      {sub && <div className="mt-1 text-2xs text-faint leading-snug">{sub}</div>}
    </div>
  )
}

export function Pnl({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('num', value > 0 && 'text-up', value < 0 && 'text-down',
      value === 0 && 'text-muted', className)}>
      {signedUsd(value)}
    </span>
  )
}

/** Utilization bar. Colour is a function of how close to the limit we are —
 *  the point is that a bar at 95% should feel different from one at 20%. */
export function Meter({
  value, label, right, danger = 0.85, warn = 0.6,
}: { value: number; label?: string; right?: ReactNode; danger?: number; warn?: number }) {
  const v = Math.max(0, Math.min(1, value))
  const tone = v >= danger ? 'bg-down' : v >= warn ? 'bg-amber' : 'bg-up'
  return (
    <div>
      {(label || right) && (
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          {label && <span className="text-xs text-muted truncate">{label}</span>}
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

const TONE_MAP: Record<string, string> = {
  live: 'border-up/40 text-up bg-up/10',
  approved: 'border-up/40 text-up bg-up/10',
  filled: 'border-up/40 text-up bg-up/10',
  open: 'border-up/40 text-up bg-up/10',
  settled: 'border-up/40 text-up bg-up/10',
  high: 'border-up/40 text-up bg-up/10',
  under_review: 'border-cyan/40 text-cyan bg-cyan/10',
  proposed: 'border-cyan/40 text-cyan bg-cyan/10',
  pending: 'border-amber/40 text-amber bg-amber/10',
  pending_approval: 'border-amber/40 text-amber bg-amber/10',
  medium: 'border-amber/40 text-amber bg-amber/10',
  partial: 'border-amber/40 text-amber bg-amber/10',
  rejected: 'border-down/40 text-down bg-down/10',
  failed: 'border-down/40 text-down bg-down/10',
  cancelled: 'border-down/40 text-down bg-down/10',
  low: 'border-hair2 text-muted',
  closed: 'border-hair2 text-muted',
}

export function Badge({ children, tone, className }: { children: ReactNode; tone?: string; className?: string }) {
  return (
    <span className={cx('chip', tone && TONE_MAP[tone], className)}>{children}</span>
  )
}

export function Dir({ d }: { d: string }) {
  const up = d === 'long' || d === 'yes'
  return (
    <span className={cx('num text-2xs font-bold px-1.5 py-0.5 rounded',
      up ? 'text-up bg-up/10' : 'text-down bg-down/10')}>
      {d.toUpperCase()}
    </span>
  )
}

export function VenueTag({ v }: { v: string }) {
  const map: Record<string, string> = {
    polymarket: 'text-violet border-violet/30',
    crypto: 'text-amber border-amber/30',
    equities: 'text-cyan border-cyan/30',
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

export function KeyVal({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 border-b border-hair/40 last:border-0">
      <span className="text-2xs text-faint shrink-0">{k}</span>
      <span className={cx('text-xs text-ink text-right', mono && 'num')}>{v}</span>
    </div>
  )
}

export function LimitRow({ name, used, limit, ratio }: { name: string; used: number; limit: number; ratio: number }) {
  return (
    <div className="py-2.5 border-b border-hair/50 last:border-0">
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
