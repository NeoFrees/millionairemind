/** Number formatting. The ladder spans $1 to $1,048,576, so precision has to
 *  adapt or small rungs render as "$1" and large ones as noise. */
export const usd = (n: number, opts: { compact?: boolean } = {}): string => {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a === 0) return '$0.00'
  if (opts.compact && a >= 1000) {
    return (n < 0 ? '-$' : '$') + (a >= 1e6
      ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'
      : (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k')
  }
  const digits = a >= 1000 ? 2 : a >= 1 ? 3 : 4
  return (n < 0 ? '-$' : '$') + a.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })
}

export const pct = (n: number, d = 2): string =>
  Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : '—'

export const signedPct = (n: number, d = 2): string =>
  Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${(n * 100).toFixed(d)}%` : '—'

export const signedUsd = (n: number): string =>
  (n >= 0 ? '+' : '') + usd(n)

export const price = (n: number): string => {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  return n.toLocaleString('en-US', {
    minimumFractionDigits: a < 2 ? 4 : 2,
    maximumFractionDigits: a < 2 ? 4 : 2,
  })
}

export const ago = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour12: false })

export const titleize = (s: string): string =>
  s.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
