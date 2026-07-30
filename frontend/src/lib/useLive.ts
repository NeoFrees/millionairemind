import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { demoSnapshot } from './demo'
import type { Snapshot } from './types'

/** Poll a resource, and re-fetch immediately whenever the backend pushes a tick.
 *  Polling is the floor, the socket is the accelerator — so the UI is still
 *  correct if the WebSocket drops, which it will. */
export function usePolled<T>(fetcher: () => Promise<T>, ms = 2500) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fRef = useRef(fetcher)
  fRef.current = fetcher

  const refresh = useCallback(async () => {
    try {
      setData(await fRef.current())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), ms)
    return () => clearInterval(id)
  }, [refresh, ms])

  return { data, error, refresh }
}

export interface LevelUpFlash { node: number; swept: number; key: number }

/** Single shared socket. Surfaces the live snapshot plus level-up events so the
 *  Ladder screen can celebrate exactly once per rung. */
export function useSocket() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [flash, setFlash] = useState<LevelUpFlash | null>(null)
  const [regressed, setRegressed] = useState<number | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout>
    let closed = false
    let demoInterval: ReturnType<typeof setInterval>
    const isDemo = window.location.hostname.endsWith('github.io') || import.meta.env.VITE_DEMO === 'true'

    const connect = () => {
      if (isDemo) {
        setSnapshot(demoSnapshot)
        setConnected(true)
        demoInterval = setInterval(() => {
          setSnapshot((prev) =>
            prev
              ? { ...prev, tick: prev.tick + 1, equity: prev.equity + 1_100 }
              : { ...demoSnapshot, tick: demoSnapshot.tick + 1 }
          )
        }, 2000)
        return
      }

      ws = new WebSocket(api.wsUrl)
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws?.close()
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data as string) as { event: string; data: Record<string, unknown> }
          if (m.event === 'tick' || m.event === 'snapshot') setSnapshot(m.data as unknown as Snapshot)
          if (m.event === 'ladder') {
            if (m.data.type === 'level_up') {
              setFlash({
                node: Number(m.data.node),
                swept: Number(m.data.swept_to_reserve ?? 0),
                key: Date.now(),
              })
            } else {
              setRegressed(Number(m.data.node))
              setTimeout(() => setRegressed(null), 3200)
            }
          }
        } catch { /* malformed frame — ignore rather than kill the socket */ }
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      clearInterval(demoInterval)
      ws?.close()
    }
  }, [])

  const clearFlash = useCallback(() => setFlash(null), [])
  return { snapshot, connected, flash, clearFlash, regressed }
}
