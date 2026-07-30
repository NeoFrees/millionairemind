import { useState } from 'react'
import {
  Activity, BarChart3, Landmark, ShieldAlert, TrendingUp, Wifi, WifiOff,
} from 'lucide-react'
import { cx } from './components/ui'
import { api } from './lib/api'
import { pct, usd } from './lib/format'
import { useSocket } from './lib/useLive'
import Dashboard from './screens/Dashboard'
import LadderScreen from './screens/Ladder'
import Opportunities from './screens/Opportunities'
import RiskConsole from './screens/Risk'
import TreasuryScreen from './screens/Treasury'

const TABS = [
  { id: 'ladder', label: 'Ladder', icon: TrendingUp },
  { id: 'dashboard', label: 'Command', icon: BarChart3 },
  { id: 'opportunities', label: 'Opportunities', icon: Activity },
  { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'treasury', label: 'Treasury', icon: Landmark },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('ladder')
  const { snapshot, connected, flash, clearFlash, regressed } = useSocket()
  const [paused, setPaused] = useState(false)

  const togglePause = async () => {
    if (paused) { await api.simStart(); setPaused(false) }
    else { await api.simStop(); setPaused(true) }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── top bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-hair bg-abyss/90 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 h-14">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-up/12 border border-up/35 grid place-items-center">
              <TrendingUp size={14} className="text-up" />
            </div>
            <div className="leading-none">
              <div className="text-sm font-bold tracking-tight">MillionaireMind</div>
              <div className="text-2xs text-faint mt-0.5">Money Manager</div>
            </div>
          </div>

          <nav className="flex items-center gap-1 ml-2 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap',
                  tab === t.id
                    ? 'bg-up/10 text-up border border-up/30'
                    : 'text-muted hover:text-ink hover:bg-panel2 border border-transparent')}>
                <t.icon size={13} />{t.label}
                {t.id === 'risk' && snapshot?.kill_tripped && (
                  <span className="h-1.5 w-1.5 rounded-full bg-down animate-pulse" />
                )}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {snapshot && (
              <div className="hidden md:flex items-center gap-4 num text-xs">
                <Ticker label="EQUITY" value={usd(snapshot.equity)} tone="up" />
                <Ticker label="NODE" value={`L${snapshot.node}`} />
                <Ticker label="NEXT" value={pct(snapshot.progress_pct, 1)} tone="cyan" />
                <Ticker label="RESERVE" value={usd(snapshot.reserve, { compact: true })} tone="cyan" />
              </div>
            )}
            <span className={cx('chip', snapshot?.kill_tripped
              ? 'border-down/50 text-down bg-down/10' : 'border-up/40 text-up bg-up/10')}>
              {snapshot?.kill_tripped ? 'HALTED' : 'ARMED'}
            </span>
            <span className="chip border-violet/35 text-violet">T0 · PAPER</span>
            <button className="btn text-2xs" onClick={() => void togglePause()}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <span title={connected ? 'live socket' : 'reconnecting'}>
              {connected
                ? <Wifi size={13} className="text-up" />
                : <WifiOff size={13} className="text-down animate-pulse" />}
            </span>
          </div>
        </div>
      </header>

      {/* ── paper-mode banner: never let the user forget what this is ──── */}
      <div className="border-b border-hair bg-panel/40 px-4 py-1.5 text-2xs text-faint flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-up shrink-0" />
        <span>
          Paper mode (T0). All venues are seeded mock adapters — no live credentials, no order
          routing, no real capital. Every adapter refuses a non-paper order at the boundary.
        </span>
      </div>

      <main className="flex-1 min-h-0 p-4">
        {tab === 'ladder' && (
          <LadderScreen flash={flash} clearFlash={clearFlash} regressed={regressed} />
        )}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'opportunities' && <Opportunities />}
        {tab === 'risk' && <RiskConsole />}
        {tab === 'treasury' && <TreasuryScreen />}
      </main>

      <footer className="border-t border-hair px-4 py-2 text-2xs text-faint flex flex-wrap gap-x-4 gap-y-1">
        <span>Survival first, compounding second.</span>
        <span className="text-hair2">|</span>
        <span>Scout → Diligence → Guardian → Execution → Monitor</span>
        <span className="text-hair2">|</span>
        <span>Risk checks are deterministic code, not prompts</span>
        {snapshot && <span className="ml-auto num">tick {snapshot.tick}</span>}
      </footer>
    </div>
  )
}

function Ticker({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'cyan' }) {
  return (
    <div className="leading-none">
      <div className="text-[9px] text-faint tracking-widest">{label}</div>
      <div className={cx('mt-1 font-semibold',
        tone === 'up' && 'text-up', tone === 'cyan' && 'text-cyan', !tone && 'text-ink')}>
        {value}
      </div>
    </div>
  )
}
