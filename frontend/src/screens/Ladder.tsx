import { AnimatePresence, motion } from 'framer-motion'
import { Lock, ShieldCheck, TrendingDown, Zap } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Empty, KeyVal, Panel, cx } from '../components/ui'
import { api } from '../lib/api'
import { ago, pct, usd } from '../lib/format'
import type { LadderState } from '../lib/types'
import { usePolled, type LevelUpFlash } from '../lib/useLive'

/** Screen 1 — The Ladder.
 *  This screen exists to answer two questions in one glance: how far along the
 *  run am I, and is my floor rising? Everything else is subordinate to those. */
export default function Ladder({
  flash, clearFlash, regressed,
}: { flash: LevelUpFlash | null; clearFlash: () => void; regressed: number | null }) {
  const { data } = usePolled<LadderState>(api.ladder, 1500)
  const currentRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const node = data?.current_node ?? 0

  // The ladder renders L20 at the top so climbing reads as climbing — which
  // puts the live rung below the fold. Centre it whenever the node changes.
  useEffect(() => {
    if (!data) return
    // Scroll the ladder's own container, not the page — scrollIntoView walks up
    // to the document and drags the whole layout, hiding the side rail.
    const id = requestAnimationFrame(() => {
      const box = scrollRef.current
      const rung = currentRef.current
      if (!box || !rung) return
      box.scrollTo({
        top: rung.offsetTop - box.clientHeight / 2 + rung.clientHeight / 2,
        behavior: 'smooth',
      })
    })
    return () => cancelAnimationFrame(id)
  }, [node, data !== null])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(clearFlash, 3600)
    return () => clearTimeout(t)
  }, [flash, clearFlash])

  if (!data) return <Empty>Connecting to the ladder engine…</Empty>

  const { nodes, equity, reserve, floor, progress_pct } = data
  // Render top-down: node 20 at the top so climbing reads as climbing.
  const rungs = Array.from({ length: nodes }, (_, i) => nodes - i)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] h-full min-h-0">
      {/* ── the ladder itself ─────────────────────────────────────────── */}
      <Panel
        title="The Compounding Ladder"
        subtitle={`Base ${usd(data.base_unit)} · node n target = base × 2ⁿ · ${pct(data.ratchet_pct, 0)} of every level-up gain is ratcheted into the protected reserve`}
        right={
          <div className="flex items-center gap-2 shrink-0">
            {regressed !== null && (
              <span className="chip border-down/50 text-down bg-down/10">
                <TrendingDown size={11} /> stepped down to L{regressed}
              </span>
            )}
            <span className="chip border-up/40 text-up bg-up/10">
              <Lock size={11} /> floor {usd(floor, { compact: true })}
            </span>
          </div>
        }
        pad={false}
        className="min-h-0"
      >
        <div ref={scrollRef} className="relative h-full overflow-y-auto px-5 py-4">
          {/* The rising baseline: reserve as a share of the current rung's target. */}
          <div className="relative">
            {rungs.map((n) => {
              const target = data.targets[n - 1]
              const done = n <= node
              const current = n === node + 1
              const reserveShare = target > 0 ? Math.min(1, reserve / target) : 0
              return (
                <div key={n} ref={current ? currentRef : undefined}
                  className="relative flex items-stretch gap-4 group scroll-mt-24">
                  {/* rail */}
                  <div className="relative w-9 shrink-0 flex flex-col items-center">
                    <div className={cx('w-px flex-1', done ? 'bg-up/50' : 'bg-hair')} />
                    <NodeDot n={n} done={done} current={current} />
                    <div className={cx('w-px flex-1', n - 1 <= node ? 'bg-up/50' : 'bg-hair')} />
                  </div>

                  {/* rung body */}
                  <div className={cx(
                    'flex-1 min-w-0 my-1 rounded-lg border px-3.5 py-2.5 transition-all duration-500',
                    done && 'border-up/25 bg-up/[0.045]',
                    current && 'border-up/60 bg-up/[0.07] shadow-node',
                    !done && !current && 'border-hair bg-panel2/40',
                  )}>
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2.5 min-w-0">
                        <span className={cx('num text-2xs font-bold w-7 shrink-0',
                          done ? 'text-up' : current ? 'text-up' : 'text-faint')}>L{n}</span>
                        <span className={cx('num text-sm font-semibold truncate',
                          done ? 'text-up/80' : current ? 'text-ink' : 'text-faint')}>
                          {usd(target, { compact: target >= 1000 })}
                        </span>
                        {done && <Lock size={10} className="text-up/60 shrink-0" />}
                      </div>
                      {current && (
                        <span className="num text-2xs text-up shrink-0">
                          {pct(progress_pct, 1)} · {usd(equity)} of {usd(target, { compact: true })}
                        </span>
                      )}
                      {done && (
                        <span className="num text-2xs text-faint shrink-0 hidden sm:block">
                          reserve covers {pct(reserveShare, 0)}
                        </span>
                      )}
                    </div>

                    {current && (
                      <div className="mt-2.5">
                        <div className="h-1.5 rounded-full bg-hair overflow-hidden relative">
                          {/* protected reserve renders as the rising baseline */}
                          <div className="absolute inset-y-0 left-0 bg-cyan/25"
                            style={{ width: `${reserveShare * 100}%` }} />
                          <motion.div
                            className="absolute inset-y-0 left-0 bg-up rounded-full"
                            initial={false}
                            animate={{ width: `${progress_pct * 100}%` }}
                            transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                          />
                        </div>
                        <div className="flex justify-between mt-1.5 text-2xs">
                          <span className="text-faint">
                            needs <span className="num text-muted">{usd(Math.max(0, target - equity))}</span> more to double
                          </span>
                          <span className="text-cyan num">reserve {usd(reserve)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Panel>

      {/* ── side rail ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 min-h-0">
        <Panel title="Run Status" className="shrink-0">
          <div className="space-y-3">
            <div>
              <div className="label">Current node</div>
              <div className="num text-3xl font-bold text-up mt-1">L{node}</div>
              <div className="text-2xs text-faint mt-0.5">
                {node === 0 ? 'at the base — first double not yet banked' : `${node} of ${nodes} doubles banked`}
              </div>
            </div>
            <div className="pt-1">
              <KeyVal k="Total equity" v={usd(equity)} mono />
              <KeyVal k="Next target" v={usd(data.next_target, { compact: true })} mono />
              <KeyVal k="Deployable" v={usd(data.deployable)} mono />
              <KeyVal k="Protected reserve" v={<span className="text-cyan">{usd(reserve)}</span>} mono />
              <KeyVal k="Locked floor" v={<span className="text-up">{usd(floor)}</span>} mono />
              <KeyVal k="Levels completed" v={data.levels_completed} mono />
              <KeyVal k="Regressions" v={
                <span className={data.regressions > 0 ? 'text-down' : ''}>{data.regressions}</span>
              } mono />
            </div>
          </div>
        </Panel>

        <Panel title="Why the Ratchet Exists" className="shrink-0">
          <p className="text-2xs text-muted leading-relaxed">
            A pure doubling strategy is a walk to ruin: one total loss at any rung ends the run,
            no matter how many doubles came before it. Sweeping{' '}
            <span className="text-cyan num">{pct(data.ratchet_pct, 0)}</span> of each level-up's gain
            into a reserve the agents cannot reach converts paper gains into a floor that only ever
            rises. The worst case degrades from <span className="text-down">zero</span> to{' '}
            <span className="text-up num">{usd(floor)}</span>.
          </p>
        </Panel>

        <Panel title="Ladder Events" pad={false} className="min-h-[160px] flex-1">
          {data.history.length === 0 ? (
            <Empty>No level-ups or regressions yet. Events land here the moment equity crosses a rung.</Empty>
          ) : (
            <ul className="divide-y divide-hair/50">
              {[...data.history].reverse().slice(0, 30).map((e, i) => (
                <li key={`${e.at}-${i}`} className="px-4 py-2 flex items-start gap-2.5 animate-ticker">
                  {e.type === 'level_up'
                    ? <Zap size={12} className="text-up mt-0.5 shrink-0" />
                    : <TrendingDown size={12} className="text-down mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-ink">
                      {e.type === 'level_up' ? `Level up → L${e.node}` : `Regressed → L${e.node}`}
                    </div>
                    <div className="text-2xs text-faint num">
                      {usd(e.equity)}
                      {e.swept_to_reserve ? ` · swept ${usd(e.swept_to_reserve)} to reserve` : ''}
                    </div>
                  </div>
                  <span className="text-2xs text-faint num shrink-0">{ago(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── level-up celebration ──────────────────────────────────────── */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.key}
            className="fixed inset-0 z-50 grid place-items-center pointer-events-none"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-up/[0.06]"
              initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.4, times: [0, 0.2, 1] }}
            />
            <motion.div
              className="relative panel px-8 py-6 text-center shadow-node border-up/50"
              initial={{ scale: 0.9, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 20 }}
            >
              <div className="flex items-center justify-center gap-2 text-up">
                <Zap size={16} />
                <span className="label text-up">Level up</span>
              </div>
              <div className="num text-5xl font-bold text-up mt-2">L{flash.node}</div>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-cyan">
                <ShieldCheck size={13} />
                <span className="num">{usd(flash.swept)}</span>
                <span className="text-faint">ratcheted into the protected reserve</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NodeDot({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <div className="relative grid place-items-center shrink-0 my-0.5">
      {current && (
        <span className="absolute inline-block h-6 w-6 rounded-full border border-up/60 animate-pulseRing" />
      )}
      <span className={cx(
        'relative h-3 w-3 rounded-full border-2 transition-colors duration-500',
        done && 'bg-up border-up shadow-node',
        current && 'bg-up/25 border-up',
        !done && !current && 'bg-abyss border-hair2',
      )} />
      {n % 5 === 0 && !done && !current && (
        <span className="absolute -right-0.5 top-4 num text-[9px] text-faint">{n}</span>
      )}
    </div>
  )
}
