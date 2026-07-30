import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ExternalLink, Radar, Skull } from 'lucide-react'
import { Badge, Dir, Empty, FrameCorners, Panel, VenueTag, cx } from '../components/ui'
import { api } from '../lib/api'
import { ago, pct, price, signedPct, titleize, usd } from '../lib/format'
import type { Candidate, Thesis, ThesisStatus } from '../lib/types'
import { usePolled } from '../lib/useLive'

const COLUMNS: { key: ThesisStatus; title: string; hint: string }[] = [
  { key: 'proposed', title: 'Proposed', hint: 'Scout leads awaiting research' },
  { key: 'under_review', title: 'Under Review', hint: 'Diligence has written a thesis' },
  { key: 'approved', title: 'Approved', hint: 'Cleared every Guardian check' },
  { key: 'live', title: 'Live', hint: 'Capital deployed' },
  { key: 'closed', title: 'Closed', hint: 'Trade exited — stop, target or time stop' },
  { key: 'rejected', title: 'Rejected', hint: 'Failed the gate — reason recorded' },
]

/** Screen 3 — Opportunity Board. The Scout queue feeding a Diligence kanban.
 *  Every card opens into the full thesis, because the thesis is the product. */
export default function Opportunities() {
  const { data: theses } = usePolled<Thesis[]>(api.theses, 2200)
  const { data: cands } = usePolled<Candidate[]>(api.candidates, 2200)
  const [open, setOpen] = useState<string | null>(null)

  if (!theses || !cands) return <Empty>Loading the research pipeline…</Empty>

  const byStatus = (s: ThesisStatus) => theses.filter((t) => t.status === s)

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <Panel title="Scout Queue"
        subtitle="Raw leads, ranked by edge discounted for book depth — cheap to generate, worthless until researched"
        right={<span className="chip border-hair2"><Radar size={11} className="text-cyan" /> {cands.length} candidates</span>}
        pad={false}>
        {cands.length === 0 ? (
          <Empty>No dislocations on the tape right now. Scouts re-scan every tick.</Empty>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto p-3">
            {cands.slice(0, 10).map((c) => (
              <div key={c.id} className="shrink-0 w-[196px] rounded-lg border border-hair bg-panel2/50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink truncate">{c.instrument}</span>
                  <Dir d={c.direction} />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <VenueTag v={c.venue} />
                  <span className="chip border-hair2">{c.edge_type.replace('_', ' ')}</span>
                </div>
                <div className="mt-2 num text-lg font-semibold text-up">{pct(c.raw_edge_pct, 2)}</div>
                <div className="text-2xs text-faint">raw edge · score {c.score.toFixed(3)}</div>
                <div className="mt-1.5 text-2xs text-muted leading-snug line-clamp-2">{c.note}</div>
                <div className="mt-2 flex items-center justify-between text-2xs text-faint num">
                  <span>{usd(c.liquidity_usd, { compact: true })} depth</span>
                  <span className={cx(c.time_sensitivity === 'high' && 'text-amber')}>{c.time_sensitivity}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <FrameCorners>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6 min-h-0">
        {COLUMNS.map((col) => {
          const items = col.key === 'proposed' ? [] : byStatus(col.key)
          const count = col.key === 'proposed' ? cands.length : items.length
          return (
            <div key={col.key} className="panel flex flex-col min-h-[300px] overflow-hidden">
              <header className="px-3 py-2.5 border-b border-hair shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-ink">{col.title}</h3>
                  <span className={cx('num text-2xs px-1.5 rounded',
                    col.key === 'live' ? 'text-up bg-up/10' :
                    col.key === 'rejected' ? 'text-down bg-down/10' :
                    col.key === 'closed' ? 'text-cyan bg-cyan/10' : 'text-muted bg-hair/60')}>
                    {count}
                  </span>
                </div>
                <p className="text-2xs text-faint mt-0.5 leading-snug">{col.hint}</p>
              </header>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {col.key === 'proposed' && cands.length > 0 && (
                  <p className="text-2xs text-faint px-1 py-2 leading-relaxed">
                    {cands.length} lead{cands.length === 1 ? '' : 's'} in the Scout queue above. Diligence
                    picks up the highest-scoring ones each tick.
                  </p>
                )}
                {items.length === 0 && col.key !== 'proposed' && (
                  <p className="text-2xs text-faint px-1 py-2">Nothing here yet.</p>
                )}
                {items.map((t) => (
                  <ThesisCard key={t.id} t={t}
                    open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      </FrameCorners>
    </div>
  )
}

function ThesisCard({ t, open, onToggle }: { t: Thesis; open: boolean; onToggle: () => void }) {
  const failed = t.checks.filter((c) => !c.passed)
  return (
    <div className={cx('rounded-lg border bg-panel2/50 overflow-hidden transition-colors',
      t.status === 'live' && 'border-up/30',
      t.status === 'rejected' && 'border-down/25',
      t.status === 'closed' && 'border-cyan/20',
      !['live', 'rejected', 'closed'].includes(t.status) && 'border-hair')}>
      <button onClick={onToggle} className="w-full text-left px-2.5 py-2 hover:bg-panel2">
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-xs font-semibold text-ink truncate">{t.instrument}</span>
          <ChevronDown size={12} className={cx('text-faint shrink-0 mt-0.5 transition-transform', open && 'rotate-180')} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Dir d={t.direction} />
          <VenueTag v={t.venue} />
          <Badge tone={t.confidence}>{t.confidence}</Badge>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-2xs">
          <Metric k="EV" v={signedPct(t.expected_value_pct)} tone={t.expected_value_pct > 0 ? 'up' : 'down'} />
          <Metric k="Win p" v={pct(t.win_probability, 0)} />
          <Metric k="Size" v={pct(t.approved_size_pct || t.recommended_size_pct)} />
          <Metric k="Kelly" v={t.kelly_fraction.toFixed(3)} />
        </div>
        {failed.length > 0 && (
          <div className="mt-1.5 text-2xs text-down truncate">blocked: {failed.map((c) => c.name).join(', ')}</div>
        )}
      </button>

      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-hair px-2.5 py-2.5 space-y-2.5 text-2xs">
          <Section label="Thesis"><p className="text-muted leading-relaxed">{t.thesis}</p></Section>
          <Section label="Probability basis"><p className="text-muted leading-relaxed">{t.probability_basis}</p></Section>
          <Section label="Levels">
            <div className="space-y-0.5 num text-muted">
              <div>entry <span className="text-ink">{price(t.entry.level)}</span></div>
              <div>target <span className="text-up">{price(t.exit.target)}</span> · stop <span className="text-down">{price(t.exit.stop)}</span></div>
              <div>frictions <span className="text-amber">{pct(t.fees_slippage_pct, 3)}</span></div>
              {t.exit.time_stop && <div className="text-faint">time stop in {ago(t.exit.time_stop).replace('-', '')}</div>}
            </div>
            <p className="text-faint leading-relaxed mt-1">{t.entry.conditions}</p>
          </Section>
          <Section label={<span className="flex items-center gap-1 text-down"><Skull size={10} /> Kill thesis</span>}>
            <p className="text-muted leading-relaxed">{t.kill_thesis}</p>
          </Section>
          <Section label="Correlation"><p className="text-muted leading-relaxed">{t.correlation_note}</p></Section>
          <Section label="Liquidity"><p className="text-muted leading-relaxed">{t.liquidity_note}</p></Section>
          {t.checks.length > 0 && (
            <Section label="Guardian checks">
              <ul className="space-y-0.5">
                {t.checks.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className={cx('truncate', c.passed ? 'text-faint' : 'text-down font-semibold')}>
                      {titleize(c.name)}
                    </span>
                    <span className={cx('num shrink-0', c.passed ? 'text-up' : 'text-down')}>
                      {c.passed ? 'pass' : `${c.actual.toPrecision(3)} / ${c.limit.toPrecision(3)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {t.sources.length > 0 && (
            <Section label="Sources">
              <ul className="space-y-0.5">
                {t.sources.map((s) => (
                  <li key={s}>
                    <a href={s} target="_blank" rel="noreferrer"
                      className="text-cyan hover:underline inline-flex items-center gap-1 truncate max-w-full">
                      <ExternalLink size={9} className="shrink-0" />
                      <span className="truncate">{s.replace(/^https?:\/\//, '')}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <div className="text-faint num pt-1 border-t border-hair/50">
            {t.created_by} · {ago(t.created_at)} ago · {t.id.slice(0, 8)}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex justify-between gap-1">
      <span className="text-faint">{k}</span>
      <span className={cx('num', tone === 'up' && 'text-up', tone === 'down' && 'text-down', !tone && 'text-muted')}>{v}</span>
    </div>
  )
}

function Section({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  )
}
