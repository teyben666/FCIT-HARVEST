import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'harvestITServerURL'

export interface LeaderboardEntry {
  name: string
  score: number
  goal: number
  completed: boolean
  timestamp: string
}

export interface LeaderboardStats {
  total: number
  completed: number
  avgScore: number
  maxScore: number
}

function normalizeBase(url: string): string {
  let u = url.trim().replace(/\/$/, '')
  if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
    u = `http://${u}`
  }
  return u
}

/** Empty string = same-origin `/api` (Vite proxy or Express hosting). */
export function getApiBase(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env) return normalizeBase(env)
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return normalizeBase(stored)
  return ''
}

export function setApiBase(url: string) {
  const n = normalizeBase(url)
  if (n) localStorage.setItem(STORAGE_KEY, n)
  else localStorage.removeItem(STORAGE_KEY)
}

export function useLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [stats, setStats] = useState<LeaderboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const prefix = (path: string) => {
    const base = getApiBase()
    return base ? `${base}${path}` : path
  }

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [lbRes, stRes] = await Promise.all([
        fetch(prefix('/api/leaderboard?limit=50')),
        fetch(prefix('/api/stats')),
      ])
      if (!lbRes.ok) throw new Error('Failed to load leaderboard')
      if (!stRes.ok) throw new Error('Failed to load stats')
      const rows = (await lbRes.json()) as Array<{
        name: string
        score: number
        goal: number
        completed: number
        timestamp: string
      }>
      const st = (await stRes.json()) as Record<string, unknown>
      setEntries(
        rows.map((r) => ({
          name: r.name,
          score: r.score,
          goal: r.goal,
          completed: !!r.completed,
          timestamp: r.timestamp,
        })),
      )
      setStats({
        total: Number(st.total) || 0,
        completed: Number(st.completed) || 0,
        avgScore: Number(st.avgScore) || 0,
        maxScore: Number(st.maxScore) || 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEntries([])
      setStats(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submitScore = useCallback(
    async (name: string, score: number, goal: number, completed: boolean) => {
      const res = await fetch(prefix('/api/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim().slice(0, 50) || 'Anonymous',
          score,
          goal,
          completed: completed ? 1 : 0,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || 'Submit failed')
      }
      await refresh()
    },
    [refresh],
  )

  return { entries, stats, error, refresh, submitScore }
}
