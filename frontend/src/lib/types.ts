export type Venue = 'polymarket' | 'crypto' | 'equities'
export type Direction = 'long' | 'short' | 'yes' | 'no'
export type Confidence = 'low' | 'medium' | 'high'
export type ThesisStatus = 'proposed' | 'under_review' | 'approved' | 'rejected' | 'live' | 'closed'

export interface RiskCheck {
  name: string; passed: boolean; limit: number; actual: number; detail: string
}

export interface Thesis {
  id: string; venue: Venue; instrument: string; direction: Direction
  thesis: string; edge_type: string
  expected_value_pct: number; win_probability: number; probability_basis: string
  entry: { level: number; conditions: string }
  exit: { target: number; stop: number; time_stop: string | null }
  fees_slippage_pct: number; liquidity_note: string
  recommended_size_pct: number; kelly_fraction: number
  correlation_note: string; correlation_group: string
  kill_thesis: string; sources: string[]
  confidence: Confidence; status: ThesisStatus
  created_by: string; created_at: string
  risk_verdict: string | null; risk_notes: string[]; approved_size_pct: number
  checks: RiskCheck[]
}

export interface Position {
  id: string; thesis_id: string; venue: Venue; instrument: string; direction: Direction
  correlation_group: string; size_usd: number; deployable_at_entry: number
  entry_price: number; mark_price: number; stop: number; target: number
  time_stop: string | null; opened_at: string; closed_at: string | null
  realized_pnl: number; unrealized_pnl: number; market_value: number
  kill_thesis: string; kill_proximity: number; status: 'open' | 'closed'
}

export interface Snapshot {
  tick: number; equity: number; node: number; next_target: number; progress_pct: number
  reserve: number; floor: number; deployable: number
  realized_pnl: number; unrealized_pnl: number
  open_positions: number; kill_tripped: boolean; running: boolean
}

export interface LadderState extends Snapshot {
  base_unit: number; nodes: number; current_node: number; ratchet_pct: number
  level_start_equity: number; levels_completed: number; regressions: number
  targets: number[]; history: LadderEvent[]
  daily_drawdown_pct: number; level_drawdown_pct: number
}

export interface LadderEvent {
  type: 'level_up' | 'regression'; node: number; equity: number
  swept_to_reserve?: number; reserve: number; floor: number; next_target: number; at: string
}

export interface CurvePoint {
  t: string; tick: number; equity: number; reserve: number; floor: number; node: number
}

export interface Activity {
  topic: string; sender: string; payload: Record<string, unknown>; at: string
}

export interface Dashboard {
  snapshot: Snapshot
  equity_curve: CurvePoint[]
  positions: Position[]
  activity: Activity[]
  drawdown_headroom: { daily: number; level: number }
  budget: { node: number; max_deployable_usd: number; deployed_usd: number; remaining_usd: number; realized_loss_usd: number }
  reserve: number
}

export interface Utilization { name: string; used: number; limit: number; pct: number }

export interface Breach {
  id: string; limit_name: string; limit: number; actual: number
  action_taken: string; at: string; rearmed_at: string | null; rearmed_by: string | null
}

export interface RiskState {
  kill_switch: { tripped: boolean; reason: string | null; tripped_at: string | null }
  utilization: Utilization[]
  breakers: { daily: { used: number; limit: number }; level: { used: number; limit: number } }
  position_cap_pct: number; kelly_fraction: number
  breaches: Breach[]
}

export interface Account {
  id: string; name: string; balance_usd: number; rail: string; linked: boolean; live: boolean
}

export interface Ticket {
  id: string; kind: 'trade' | 'payment'; thesis_id: string | null; payment_id: string | null
  headline: string; size_usd: number; edge_pct: number; expected_value_pct: number
  risk_summary: string; checks: RiskCheck[]
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  created_at: string; decided_at: string | null
}

export interface Payment {
  id: string; rail: string; from_account: string; to_account: string; amount_usd: number
  purpose: string; status: string; requires_human: boolean; created_at: string; paper: boolean
}

export interface Treasury {
  accounts: Account[]
  adapters: { name: string; venue: string; live: boolean; mode: string }[]
  payments: Payment[]
  tickets: Ticket[]
  ledger: { from: string; to: string; amount_usd: number; paper: boolean; status: string }[]
  tier: string
}

export interface AuditEntry {
  seq: number; at: string; agent: string; action: string
  subject: string | null; severity: string; detail: string; payload: Record<string, unknown>
}

export interface Config {
  base_unit: number; ladder_nodes: number; ratchet_pct: number
  autonomy_tier: string; tick_seconds: number
  limits: Record<string, number>
}

export interface Candidate {
  id: string; venue: Venue; instrument: string; direction: Direction; edge_type: string
  raw_edge_pct: number; liquidity_usd: number; time_sensitivity: string
  note: string; score: number; discovered_at: string
}
