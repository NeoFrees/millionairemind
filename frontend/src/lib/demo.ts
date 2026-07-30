import type {
  Candidate,
  Dashboard,
  LadderState,
  RiskState,
  Snapshot,
  Thesis,
  Treasury,
  AuditEntry,
} from './types'

export const demoSnapshot: Snapshot = {
  tick: 42,
  equity: 812_400,
  node: 9,
  next_target: 1_048_576,
  progress_pct: 0.77,
  reserve: 228_180,
  floor: 524_288,
  deployable: 500_220,
  realized_pnl: 32_640,
  unrealized_pnl: 6_420,
  open_positions: 4,
  kill_tripped: false,
  running: true,
}

const tickOrigin = Date.now() - 20 * 60 * 1000
const equityCurve = Array.from({ length: 24 }, (_, i) => {
  const tick = i * 5
  const equity = 640_000 + tick * 6_700 + ((i % 3) * 3_500)
  const floor = tick >= 20 ? 524_288 : 0
  return {
    tick,
    equity,
    floor,
    reserve: Math.round(Math.max(0, equity - floor) * 0.27),
    node: Math.min(9, Math.floor(tick / 12)),
    at: new Date(tickOrigin + i * 45_000).toISOString(),
    next_target: 1_048_576,
  }
})

const positions = [
  {
    id: 'pos-1',
    thesis_id: 't-1',
    venue: 'crypto' as const,
    instrument: 'ETH > $3,200 on Polymarket',
    direction: 'long' as const,
    correlation_group: 'crypto-beta',
    size_usd: 72_000,
    deployable_at_entry: 550_000,
    entry_price: 0.382,
    mark_price: 0.391,
    stop: 0.348,
    target: 0.445,
    time_stop: '2026-08-05',
    opened_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    closed_at: null,
    realized_pnl: 0,
    unrealized_pnl: 5_580,
    market_value: 74_000,
    kill_thesis: 'If ETH funding rallies above 10bps before the target clips',
    kill_proximity: 0.22,
    status: 'open' as const,
  },
  {
    id: 'pos-2',
    thesis_id: 't-2',
    venue: 'polymarket' as const,
    instrument: 'Will US CPI beat 0.2%?',
    direction: 'yes' as const,
    correlation_group: 'macro',
    size_usd: 48_500,
    deployable_at_entry: 560_000,
    entry_price: 0.41,
    mark_price: 0.43,
    stop: 0.34,
    target: 0.55,
    time_stop: '2026-07-31',
    opened_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    closed_at: null,
    realized_pnl: 0,
    unrealized_pnl: 3_390,
    market_value: 52_420,
    kill_thesis: 'deflation narrative collapses, risk-on flow fades',
    kill_proximity: 0.46,
    status: 'open' as const,
  },
  {
    id: 'pos-3',
    thesis_id: 't-3',
    venue: 'equities' as const,
    instrument: 'S&P 500 weekly dispersion',
    direction: 'long' as const,
    correlation_group: 'equities',
    size_usd: 31_300,
    deployable_at_entry: 520_000,
    entry_price: 0.14,
    mark_price: 0.155,
    stop: 0.102,
    target: 0.215,
    time_stop: '2026-08-02',
    opened_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    closed_at: null,
    realized_pnl: 0,
    unrealized_pnl: 1_870,
    market_value: 32_760,
    kill_thesis: 'volatility crush before the macro cue arrives',
    kill_proximity: 0.14,
    status: 'open' as const,
  },
  {
    id: 'pos-4',
    thesis_id: 't-4',
    venue: 'polymarket' as const,
    instrument: 'BTC > $45k by Friday',
    direction: 'long' as const,
    correlation_group: 'crypto-beta',
    size_usd: 18_600,
    deployable_at_entry: 520_000,
    entry_price: 0.48,
    mark_price: 0.51,
    stop: 0.44,
    target: 0.58,
    time_stop: '2026-08-01',
    opened_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    closed_at: null,
    realized_pnl: 0,
    unrealized_pnl: 1_140,
    market_value: 19_740,
    kill_thesis: 'Bitcoin momentum collapses on macro flow reversal',
    kill_proximity: 0.31,
    status: 'open' as const,
  },
]

const activity = [
  { topic: 'diligence.complete', sender: 'Diligence', payload: { thesis: 't-5', edge: 4.1 }, at: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
  { topic: 'execution.filled', sender: 'Execution', payload: { size: 72_000, venue: 'crypto' }, at: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
  { topic: 'guardian.passed', sender: 'Guardian', payload: { limit: 'total_risk', used: '19%' }, at: new Date(Date.now() - 12 * 60 * 1000).toISOString() },
  { topic: 'treasury.sweep', sender: 'Treasury', payload: { amount: 22_400 }, at: new Date(Date.now() - 16 * 60 * 1000).toISOString() },
  { topic: 'monitor.reprice', sender: 'Monitor', payload: { open: 4, exposure: '18.4%' }, at: new Date(Date.now() - 22 * 60 * 1000).toISOString() },
  { topic: 'scout.alert', sender: 'Scout', payload: { next: 'crypto', score: 0.74 }, at: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
]

const budget = {
  node: 9,
  max_deployable_usd: 180_000,
  deployed_usd: 140_700,
  remaining_usd: 39_300,
  realized_loss_usd: 11_200,
}

const treasuryData: Treasury = {
  accounts: [
    { id: 'acc-1', name: 'Paper Treasury', balance_usd: 685_000, rail: 'internal', linked: true, live: false },
    { id: 'acc-2', name: 'Margin Account', balance_usd: 120_000, rail: 'exchange', linked: false, live: false },
  ],
  adapters: [
    { name: 'Mock Bank', venue: 'bank', live: false, mode: 'paper' },
    { name: 'Mock Exchange', venue: 'crypto', live: false, mode: 'paper' },
  ],
  payments: [],
  tickets: [],
  ledger: [
    { from: 'Paper Treasury', to: 'Margin Account', amount_usd: 10_000, paper: true, status: 'completed' },
  ],
  tier: 'T0',
}

const candidateTemplate: Candidate = {
  id: 'candidate-1',
  venue: 'polymarket',
  instrument: 'BTC > $45k',
  direction: 'yes',
  edge_type: 'directional',
  raw_edge_pct: 4.2,
  liquidity_usd: 181_000,
  time_sensitivity: '48h',
  note: 'Rally conviction from halving flow and momentum pulse.',
  score: 0.78,
  discovered_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
}

const thesisTemplate: Thesis = {
  id: 't-1',
  venue: 'polymarket',
  instrument: 'ETH > $3,200',
  direction: 'yes',
  thesis: 'Macro liquidity improves while funding remains steeply negative.',
  edge_type: 'directional',
  expected_value_pct: 3.7,
  win_probability: 0.62,
  probability_basis: 'market flow and funding curve',
  entry: { level: 0.382, conditions: 'Funding < 8bps and RSI < 62' },
  exit: { target: 0.445, stop: 0.348, time_stop: '2026-08-05' },
  fees_slippage_pct: 0.9,
  liquidity_note: 'Depth is shallow but sufficient for a 4% allocation.',
  recommended_size_pct: 8.5,
  kelly_fraction: 0.24,
  correlation_note: 'High correlation to crypto-beta exposures.',
  correlation_group: 'crypto-beta',
  kill_thesis: 'Funding spikes above 10bps before target',
  sources: ['venue feed', 'funding curve', 'open interest'],
  confidence: 'high',
  status: 'live',
  created_by: 'Diligence',
  created_at: new Date(Date.now() - 34 * 60 * 1000).toISOString(),
  risk_verdict: 'approved',
  risk_notes: ['position within exposure limits', 'positive directional EV'],
  approved_size_pct: 8.5,
  checks: [],
}

export const demoData: Record<string, () => unknown> = {
  '/api/health': () => ({ ok: true, tier: 'T0', paper_only: true, tick: demoSnapshot.tick }),
  '/api/config': () => ({
    base_unit: 1000,
    ladder_nodes: 20,
    ratchet_pct: 0.2,
    autonomy_tier: 'T0',
    tick_seconds: 2,
    limits: {
      kelly_fraction: 0.25,
      max_position_pct: 0.1,
      max_venue_pct: 0.35,
      max_total_risk_pct: 0.5,
      max_correlation_pct: 0.2,
      max_daily_drawdown_pct: 0.1,
      max_level_drawdown_pct: 0.25,
      min_edge_pct: 0.02,
      max_liquidity_fraction: 0.1,
    },
  }),
  '/api/ladder': () => ({
    ...demoSnapshot,
    base_unit: 1000,
    nodes: 20,
    current_node: demoSnapshot.node,
    ratchet_pct: 0.2,
    level_start_equity: 420_000,
    levels_completed: 9,
    regressions: 1,
    targets: Array.from({ length: 20 }, (_, i) => 1000 * 2 ** (i + 1)),
    history: equityCurve.map((point) => ({ type: point.tick % 12 === 0 ? 'level_up' : 'regression', node: point.node, equity: point.equity, swept_to_reserve: point.reserve, reserve: point.floor, floor: point.floor, next_target: point.next_target, at: point.at })),
  }),
  '/api/dashboard': () => ({
    snapshot: demoSnapshot,
    equity_curve: equityCurve,
    positions,
    activity,
    drawdown_headroom: { daily: 0.08, level: 0.14 },
    budget,
    reserve: demoSnapshot.reserve,
  }),
  '/api/candidates': () => [candidateTemplate],
  '/api/theses': () => [thesisTemplate],
  '/api/risk': () => ({
    kill_switch: { tripped: false, reason: null, tripped_at: null },
    utilization: [
      { name: 'max_position_pct', used: 0.72, limit: 1, pct: 0.72 },
      { name: 'max_venue_pct', used: 0.42, limit: 1, pct: 0.42 },
      { name: 'total_risk', used: 0.24, limit: 1, pct: 0.24 },
    ],
    breakers: { daily: { used: 0.12, limit: 0.1 }, level: { used: 0.14, limit: 0.25 } },
    position_cap_pct: 0.1,
    kelly_fraction: 0.25,
    breaches: [],
  }),
  '/api/treasury': () => treasuryData,
  '/api/audit': () => ({ count: 12, entries: activity.map((a, i) => ({ seq: i + 1, at: a.at, agent: a.sender, action: a.topic, subject: null, severity: 'info', detail: JSON.stringify(a.payload), payload: a.payload })) }),
}

export const demoCandidates = [candidateTemplate]
export const demoTheses = [thesisTemplate]
export const demoTreasury = treasuryData
export const demoRisk = demoData['/api/risk']() as RiskState
export const demoLadder = demoData['/api/ladder']() as LadderState
export const demoDashboard = demoData['/api/dashboard']() as Dashboard
export const demoAudit = demoData['/api/audit']() as { count: number; entries: AuditEntry[] }
