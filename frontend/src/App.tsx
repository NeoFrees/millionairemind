import { useState } from 'react'
import {
  Activity, BarChart3, Bell, Download, Landmark, Layers, Search, ShieldAlert,
  TrendingUp, User, Wifi, WifiOff,
} from 'lucide-react'
import { Delta, Tip, cx } from './components/ui'
import { api } from './lib/api'
import { pct, usd } from './lib/format'
import { useSocket } from './lib/useLive'
import Dashboard from './screens/Dashboard'
import LadderScreen from './screens/Ladder'
import Opportunities from './screens/Opportunities'
import RiskConsole from './screens/Risk'
import TreasuryScreen from './screens/Treasury'
import VisualHub from './screens/VisualHub'

/** Section titles are the page H1 — they name the desk function, not the widget. */
const TABS = [
  { id: 'dashboard', label: 'Capital Allocation', icon: BarChart3,
    h1: 'Capital Allocation & Execution',
    micro: 'Marked to last print · adjusted for fees and slippage · paper ledger' },
  { id: 'ladder', label: 'Compounding Ladder', icon: TrendingUp,
    h1: 'Compounding Ladder & Capital Floors',
    micro: 'Rung targets are ratcheted — swept capital is not redeployable' },
  { id: 'opportunities', label: 'Opportunity Pipeline', icon: Activity,
    h1: 'Opportunity Pipeline & Diligence',
    micro: 'Scored on raw edge net of fees · pre-Guardian, non-actionable' },
  { id: 'risk', label: 'Risk Exposure', icon: ShieldAlert,
    h1: 'Risk Exposure & Limit Utilisation',
    micro: 'Limits are deterministic code paths, not model judgement' },
  { id: 'treasury', label: 'Liquidity Pools', icon: Landmark,
    h1: 'Liquidity Pools & Settlement',
    micro: 'Balances as of T+1 close · all rails in paper mode' },
  { id: 'visuals', label: 'Portfolio Analytics', icon: Layers,
    h1: 'Portfolio Performance & Attribution',
    micro: 'Allocation by asset class · order flow reconstructed from the bus' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard')
  const { snapshot, connected, flash, clearFlash, regressed } = useSocket()
  const [paused, setPaused] = useState(false)
  const active = TABS.find((t) => t.id === tab)!

  const togglePause = async () => {
    if (paused) { await api.simStart(); setPaused(false) }
    else { await api.simStop(); setPaused(true) }
  }

  const s = snapshot
  const dayPnl = s ? s.realized_pnl + s.unrealized_pnl : 0
  const openEquity = s ? s.equity - dayPnl : 0
  const dayPct = openEquity > 0 ? dayPnl / openEquity : 0
  const buyingPower = s ? s.deployable + s.reserve : 0

  return (
    <div className="min-h-screen flex flex-col">
      {/* ══ THE TAPE ══════════════════════════════════════════════════════
          Left: identity + paper-mode badge. Centre: the four numbers that
          decide whether anything else on the page matters. Right: session. */}
      <header className="sticky top-0 z-40 border-b border-hair bg-abyss/95 backdrop-blur-md shadow-tape">
        <div className="flex items-stretch gap-0 px-gutter2 lg:px-gutter h-16">

          {/* identity */}
          <div className="flex items-center gap-3 shrink-0 pr-5">
            <div className="h-9 w-9 rounded-card bg-ink grid place-items-center shadow-panel">
              <TrendingUp size={16} className="text-up" strokeWidth={2.5} />
            </div>
            <div className="leading-none">
              <div className="text-sm font-bold tracking-tight text-ink">MillionaireMind</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="chip chip-paper">PAPER MODE</span>
                <Tip text="Socket is streaming. Marks refresh on every engine tick.">
                  <span className="inline-flex items-center gap-1">
                    <span className={cx(connected ? 'live-dot' : 'h-2 w-2 rounded-full bg-down')} />
                    <span className="text-[9px] font-bold tracking-widest text-muted">
                      {connected ? 'LIVE' : 'RECONNECTING'}
                    </span>
                  </span>
                </Tip>
              </div>
            </div>
          </div>

          {/* key metrics strip — monospaced, decimal-aligned */}
          {s && (
            <div className="hidden lg:flex items-stretch flex-1 min-w-0 border-l border-hair">
              <TapeCell label="Total Equity"
                tip="Cash plus mark-to-market value of all open positions, net of accrued fees.">
                <span className="num text-sm font-semibold text-ink">{usd(s.equity)}</span>
              </TapeCell>
              <TapeCell label="Daily P&L"
                tip="Realised plus unrealised P&L for the current session, gross of tax.">
                <span className="flex items-baseline gap-2">
                  <span className={cx('num text-sm font-semibold', dayPnl >= 0 ? 'text-up' : 'text-down')}>
                    {(dayPnl >= 0 ? '+' : '') + usd(dayPnl)}
                  </span>
                  <Delta value={dayPct} digits={1} />
                </span>
              </TapeCell>
              <TapeCell label="Cash & Equivalents"
                tip="Swept reserve. Ring-fenced — the execution engine cannot draw on it.">
                <span className="num text-sm font-semibold text-ink">{usd(s.reserve)}</span>
              </TapeCell>
              <TapeCell label="Buying Power"
                tip="Deployable capital plus reserve. Deployable is what limits actually permit today.">
                <span className="num text-sm font-semibold text-ink">{usd(buyingPower)}</span>
              </TapeCell>
              <TapeCell label="Next Rung" tip="Progress toward the next ladder target.">
                <span className="num text-sm font-semibold text-cyan">{pct(s.progress_pct, 1)}</span>
              </TapeCell>
            </div>
          )}

          {/* session controls */}
          <div className="ml-auto flex items-center gap-2 shrink-0 pl-4">
            <div className="relative hidden xl:block w-52">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input className="search" placeholder="Search tickers, orders, reports…" aria-label="Global search" />
            </div>
            <span className={cx('chip', s?.kill_tripped
              ? 'border-down/50 text-down bg-down/[0.08]' : 'border-up/45 text-upDim bg-up/[0.10]')}>
              {s?.kill_tripped ? 'HALTED' : 'ARMED'}
            </span>
            <button className={cx('btn', paused ? 'btn-primary' : 'btn-secondary')}
              onClick={() => void togglePause()}>
              {paused ? 'Resume Flow' : 'Pause Flow'}
            </button>
            <button className="btn"><Download size={12} />Export Report</button>
            <Tip text="No alerts breaching threshold.">
              <button className="btn px-2" aria-label="Notifications"><Bell size={13} /></button>
            </Tip>
            <Tip text={connected ? 'Live socket connected' : 'Socket reconnecting'}>
              <span className="px-1">
                {connected ? <Wifi size={14} className="text-up" />
                  : <WifiOff size={14} className="text-down animate-pulse" />}
              </span>
            </Tip>
            <button className="h-8 w-8 rounded-full bg-panel2 border border-hair grid place-items-center text-muted hover:text-ink transition"
              aria-label="Account">
              <User size={14} />
            </button>
          </div>
        </div>

        {/* navigation */}
        <nav className="flex items-center gap-1 px-gutter2 lg:px-gutter overflow-x-auto border-t border-hair">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cx('flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-cyan text-ink'
                  : 'border-transparent text-muted hover:text-ink hover:border-hair2')}>
              <t.icon size={13} />{t.label}
              {t.id === 'risk' && s?.kill_tripped && (
                <span className="h-1.5 w-1.5 rounded-full bg-down animate-pulse" />
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* ══ PAGE HEADER: H1 + micro-copy ═════════════════════════════════ */}
      <div className="px-gutter2 lg:px-gutter pt-gutter pb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="h1 text-xl">{active.h1}</h1>
          <p className="micro mt-1">{active.micro}</p>
        </div>
        {s && (
          <p className="micro num">
            tick {s.tick} · {s.open_positions} open positions · engine {s.running ? 'running' : 'paused'}
          </p>
        )}
      </div>

      {/* ══ PAPER-MODE DISCLOSURE ════════════════════════════════════════ */}
      <div className="mx-gutter2 lg:mx-gutter mb-gutter rounded-card border border-amber/40 bg-amber/[0.06] px-4 py-2.5 flex items-start gap-2.5">
        <span className="mt-0.5 h-2 w-2 rounded-full bg-amber shrink-0" />
        <p className="text-2xs text-[#92400E] leading-relaxed">
          <span className="font-semibold">Simulated environment (T0).</span> All venues are seeded
          mock adapters — no live credentials, no order routing, no real capital. Every adapter
          refuses a non-paper order at the boundary. Figures are illustrative and are not an
          offer, a recommendation, or a record of achieved returns.
        </p>
      </div>

      <main className="flex-1 min-h-0 px-gutter2 lg:px-gutter pb-gutter">
        {tab === 'ladder' && (
          <LadderScreen flash={flash} clearFlash={clearFlash} regressed={regressed} />
        )}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'opportunities' && <Opportunities />}
        {tab === 'risk' && <RiskConsole />}
        {tab === 'treasury' && <TreasuryScreen />}
        {tab === 'visuals' && <VisualHub />}
      </main>

      <footer className="border-t border-hair bg-abyss px-gutter2 lg:px-gutter py-3 flex flex-wrap gap-x-5 gap-y-1 micro">
        <span className="font-semibold text-muted">Survival first, compounding second.</span>
        <span className="text-hair2">|</span>
        <span>Discovery → Diligence → Risk Gate → Execution → Monitoring</span>
        <span className="text-hair2">|</span>
        <span>Limit checks are deterministic code, not model prompts</span>
        {s && <span className="ml-auto num">tick {s.tick}</span>}
      </footer>
    </div>
  )
}

function TapeCell({ label, children, tip }: { label: string; children: React.ReactNode; tip: string }) {
  return (
    <div className="tape-cell min-w-0">
      <Tip text={tip}>
        <span className="label text-[9px] tracking-[0.14em] whitespace-nowrap">{label}</span>
      </Tip>
      <div className="mt-1.5 whitespace-nowrap">{children}</div>
    </div>
  )
}
