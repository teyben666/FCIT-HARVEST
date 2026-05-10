import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'harvestit-api-base'

export function getApiBase(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function setApiBase(url: string): void {
  if (typeof window === 'undefined') return
  const trimmed = url.trim().replace(/\/$/, '')
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, trimmed)
  }
}

export type LeaderboardEntry = {
  id: number
  name: string
  score: number
  goal: number
  completed: boolean
  timestamp: string
}

export type LeaderboardStats = {
  total: number
  completed: number
  avgScore: number
  maxScore: number
  minScore: number
}

type ApiRow = {
  id: number
  name: string
  score: number
  goal: number
  completed: number
  timestamp: string
}

function mapRow(r: ApiRow): LeaderboardEntry {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    goal: r.goal,
    completed: r.completed === 1,
    timestamp: r.timestamp,
  }
}

function apiPrefix(path: string): string {
  const base = getApiBase().replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

export function useLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [stats, setStats] = useState<LeaderboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [lbRes, statsRes] = await Promise.all([
        fetch(apiPrefix('/api/leaderboard')),
        fetch(apiPrefix('/api/stats')),
      ])
      if (!lbRes.ok) {
        const j = (await lbRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Leaderboard HTTP ${lbRes.status}`)
      }
      if (!statsRes.ok) {
        const j = (await statsRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Stats HTTP ${statsRes.status}`)
      }
      const rows = (await lbRes.json()) as ApiRow[]
      const s = (await statsRes.json()) as LeaderboardStats
      setEntries(Array.isArray(rows) ? rows.map(mapRow) : [])
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEntries([])
      setStats(null)
    }
  }, [])

  const submitScore = useCallback(
    async (name: string, score: number, goal: number, completed: boolean) => {
      const res = await fetch(apiPrefix('/api/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, goal, completed }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || `Submit HTTP ${res.status}`)
      await refresh()
    },
    [refresh],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { entries, stats, error, refresh, submitScore }
}
