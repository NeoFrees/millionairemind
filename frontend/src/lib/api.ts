import type {
  Candidate, Config, Dashboard, LadderState, RiskState, Snapshot, Thesis, Treasury, AuditEntry,
} from './types'
import { demoData } from './demo'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'
const DEMO_MODE = import.meta.env.VITE_DEMO === 'true' || window.location.hostname.endsWith('github.io')

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`)
    return r.json() as Promise<T>
  } catch (error) {
    if (!DEMO_MODE) throw error
    const key = path.split('?')[0]
    const fallback = demoData[key]
    if (!fallback) throw error
    return fallback() as T
  }
}

function postFallback<T>(path: string, init: RequestInit, fallback: T): Promise<T> {
  if (!DEMO_MODE) return req<T>(path, init)
  return Promise.resolve(fallback)
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

  kill: () => postFallback('/api/risk/kill', { method: 'POST' }, {}),
  rearm: () => postFallback('/api/risk/rearm', { method: 'POST' }, { rearmed: true }),
  decide: (_id: string, _approve: boolean) => postFallback('/api/approvals/unknown', { method: 'POST' }, {}),
  transfer: (_b: { from_account: string; to_account: string; amount_usd: number; purpose: string }) =>
    postFallback('/api/treasury/transfer', { method: 'POST', body: JSON.stringify(_b) }, {}),
  simStart: () => postFallback('/api/sim/start', { method: 'POST' }, { running: true }),
  simStop: () => postFallback('/api/sim/stop', { method: 'POST' }, { running: false }),
  simTick: () => postFallback('/api/sim/tick', { method: 'POST' }, {}),
}

export type WsEvent =
  | { event: 'snapshot' | 'tick'; data: Snapshot }
  | { event: 'ladder'; data: { type: string; node: number; swept_to_reserve?: number } }
  | { event: 'activity'; data: { topic: string; sender: string; at: string } }
  | { event: 'ticket' | 'ping'; data: unknown }
