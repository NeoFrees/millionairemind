import type {
  Candidate, Config, Dashboard, LadderState, RiskState, Snapshot, Thesis, Treasury, AuditEntry,
} from './types'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
  return r.json() as Promise<T>
}

export const api = {
  base: BASE,
  wsUrl: BASE.replace(/^http/, 'ws') + '/ws',

  health: () => req<{ ok: boolean; tier: string; paper_only: boolean; tick: number }>('/api/health'),
  config: () => req<Config>('/api/config'),
  ladder: () => req<LadderState>('/api/ladder'),
  dashboard: () => req<Dashboard>('/api/dashboard'),
  theses: () => req<Thesis[]>('/api/theses'),
  candidates: () => req<Candidate[]>('/api/candidates'),
  risk: () => req<RiskState>('/api/risk'),
  treasury: () => req<Treasury>('/api/treasury'),
  audit: (limit = 150) => req<{ count: number; entries: AuditEntry[] }>(`/api/audit?limit=${limit}`),

  kill: () => req<unknown>('/api/risk/kill', { method: 'POST' }),
  rearm: () => req<{ rearmed: boolean }>('/api/risk/rearm', { method: 'POST' }),
  decide: (id: string, approve: boolean) =>
    req<unknown>(`/api/approvals/${id}`, { method: 'POST', body: JSON.stringify({ approve }) }),
  transfer: (b: { from_account: string; to_account: string; amount_usd: number; purpose: string }) =>
    req<unknown>('/api/treasury/transfer', { method: 'POST', body: JSON.stringify(b) }),
  simStart: () => req<{ running: boolean }>('/api/sim/start', { method: 'POST' }),
  simStop: () => req<{ running: boolean }>('/api/sim/stop', { method: 'POST' }),
  simTick: () => req<unknown>('/api/sim/tick', { method: 'POST' }),
}

export type WsEvent =
  | { event: 'snapshot' | 'tick'; data: Snapshot }
  | { event: 'ladder'; data: { type: string; node: number; swept_to_reserve?: number } }
  | { event: 'activity'; data: { topic: string; sender: string; at: string } }
  | { event: 'ticket' | 'ping'; data: unknown }
