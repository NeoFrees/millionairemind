import { useState } from 'react'
import { Check, Landmark, Lock, ScrollText, X } from 'lucide-react'
import { Badge, Empty, Panel, VenueTag, cx } from '../components/ui'
import { api } from '../lib/api'
import { ago, clock, pct, titleize, usd } from '../lib/format'
import type { AuditEntry, Treasury as TData } from '../lib/types'
import { usePolled } from '../lib/useLive'

/** Screen 5 — Treasury & Approvals. Linked accounts, the human approval inbox
 *  with full context per ticket, and the immutable audit log. */
export default function Treasury() {
  const { data, refresh } = usePolled<TData>(api.treasury, 2200)
  const { data: audit } = usePolled<{ count: number; entries: AuditEntry[] }>(
    () => api.audit(200), 2500,
  )
  const [busy, setBusy] = useState<string | null>(null)

  if (!data) return <Empty>Loading treasury…</Empty>

  const pending = data.tickets.filter((t) => t.status === 'pending')
  const decided = data.tickets.filter((t) => t.status !== 'pending')

  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    try { await api.decide(id, approve); await refresh() } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* ── accounts ────────────────────────────────────────────────── */}
      <Panel title="Linked Accounts"
        subtitle="All balances simulated — no adapter in this build has live credentials or write access"
        right={<Badge tone="live">tier {data.tier} · paper</Badge>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {data.accounts.map((a) => {
            const locked = a.id === 'protected_reserve'
            return (
              <div key={a.id} className={cx('rounded-lg border px-3.5 py-3',
                locked ? 'border-cyan/35 bg-cyan/[0.05]' : 'border-hair bg-panel2/40')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink truncate">{a.name}</span>
                  {locked
                    ? <Lock size={11} className="text-cyan shrink-0" />
                    : <Landmark size={11} className="text-faint shrink-0" />}
                </div>
                <div className={cx('num text-lg font-semibold mt-1.5', locked ? 'text-cyan' : 'text-ink')}>
                  {usd(a.balance_usd)}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="chip border-hair2">{a.rail}</span>
                  <span className="chip border-up/30 text-up">paper</span>
                </div>
                {locked && (
                  <p className="text-2xs text-cyan/70 mt-2 leading-snug">
                    Refused as a funding source at the adapter boundary, not just in the risk engine.
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-hair flex flex-wrap gap-2">
          {data.adapters.map((ad) => (
            <span key={ad.name} className="chip border-hair2 gap-1.5">
              <VenueTag v={ad.venue} />
              <span className="text-faint num">{ad.name}</span>
              <span className="text-up">{ad.mode}</span>
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-h-0">
        {/* ── approval inbox ──────────────────────────────────────────── */}
        <Panel title="Approval Inbox"
          subtitle="One tap, with every number needed to decide — trade tickets and capital movements"
          right={<span className={cx('chip', pending.length > 0 ? 'border-amber/40 text-amber bg-amber/10' : 'border-hair2')}>
            {pending.length} pending
          </span>}
          pad={false} className="min-h-[280px]">
          <div className="overflow-y-auto max-h-[460px] divide-y divide-hair/50">
            {pending.length === 0 && decided.length === 0 && (
              <Empty>
                Nothing awaiting approval. At tier T0 the paper pipeline auto-clears risk-approved
                trades; T1 and above route every ticket through this inbox.
              </Empty>
            )}
            {pending.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={t.kind === 'trade' ? 'under_review' : 'pending'}>{t.kind}</Badge>
                      <span className="text-xs font-semibold text-ink truncate">{t.headline}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-2xs num">
                      <span className="text-faint">size <span className="text-ink">{usd(t.size_usd)}</span></span>
                      {t.kind === 'trade' && (
                        <span className="text-faint">EV <span className={t.expected_value_pct >= 0 ? 'text-up' : 'text-down'}>
                          {pct(t.expected_value_pct)}
                        </span></span>
                      )}
                      <span className="text-faint">{ago(t.created_at)} ago</span>
                    </div>
                    <p className="text-2xs text-muted mt-1.5 leading-relaxed">{t.risk_summary}</p>
                    {t.checks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.checks.map((c) => (
                          <span key={c.name}
                            className={cx('chip text-[10px]', c.passed
                              ? 'border-up/25 text-up/80' : 'border-down/40 text-down')}>
                            {titleize(c.name)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button className="btn btn-up" disabled={busy === t.id}
                      onClick={() => void decide(t.id, true)}>
                      <Check size={12} className="inline mr-1 -mt-0.5" /> Approve
                    </button>
                    <button className="btn btn-down" disabled={busy === t.id}
                      onClick={() => void decide(t.id, false)}>
                      <X size={12} className="inline mr-1 -mt-0.5" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {decided.map((t) => (
              <div key={t.id} className="px-4 py-2.5 opacity-60">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted truncate">{t.headline}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="num text-2xs text-faint">{usd(t.size_usd)}</span>
                    <Badge tone={t.status}>{t.status}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── audit ───────────────────────────────────────────────────── */}
        <Panel title="Immutable Audit Log"
          subtitle="Append-only. No UPDATE or DELETE statement exists in the audit module."
          right={<span className="chip border-hair2"><ScrollText size={11} /> {audit?.count ?? 0} entries</span>}
          pad={false} className="min-h-[280px]">
          {!audit || audit.entries.length === 0 ? (
            <Empty>Audit log is empty.</Empty>
          ) : (
            <div className="overflow-auto max-h-[460px]">
              <table className="grid-table">
                <thead>
                  <tr><th className="w-12">#</th><th className="w-16">Time</th><th className="w-20">Agent</th>
                    <th>Action & detail</th></tr>
                </thead>
                <tbody>
                  {audit.entries.map((e) => (
                    <tr key={e.seq}>
                      <td className="num text-faint">{e.seq}</td>
                      <td className="num text-faint whitespace-nowrap">{clock(e.at)}</td>
                      <td>
                        <span className={cx('chip text-[10px]',
                          e.agent === 'guardian' ? 'border-down/30 text-down' :
                          e.agent === 'human' ? 'border-violet/40 text-violet' :
                          e.agent === 'coordinator' ? 'border-cyan/30 text-cyan' : 'border-hair2')}>
                          {e.agent}
                        </span>
                      </td>
                      <td>
                        <div className={cx('text-xs font-medium',
                          e.severity === 'critical' ? 'text-down' :
                          e.severity === 'warn' ? 'text-amber' :
                          e.severity === 'error' ? 'text-down' : 'text-ink')}>
                          {titleize(e.action)}
                        </div>
                        {e.detail && <div className="text-2xs text-faint leading-snug mt-0.5">{e.detail}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── ledger ──────────────────────────────────────────────────── */}
      <Panel title="Capital Movement Ledger" subtitle="Every simulated transfer, including ratchet sweeps"
        pad={false} className="shrink-0">
        {data.ledger.length === 0 ? (
          <Empty>No transfers yet. Ratchet sweeps land here on every level-up.</Empty>
        ) : (
          <div className="overflow-auto max-h-[200px]">
            <table className="grid-table">
              <thead><tr><th>From</th><th>To</th><th className="text-right">Amount</th><th>Status</th><th>Mode</th></tr></thead>
              <tbody>
                {data.ledger.map((l, i) => (
                  <tr key={i}>
                    <td className="text-muted">{titleize(l.from)}</td>
                    <td className={l.to === 'protected_reserve' ? 'text-cyan' : 'text-muted'}>{titleize(l.to)}</td>
                    <td className="text-right num text-ink">{usd(l.amount_usd)}</td>
                    <td><Badge tone={l.status}>{l.status}</Badge></td>
                    <td><Badge tone="live">paper</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
