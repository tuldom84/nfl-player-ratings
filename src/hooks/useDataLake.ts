import { useState, useEffect } from 'react'
import type { DataLake, Player } from '../lib/types'
import { applyValueGrades } from '../lib/valueGrade'

const CACHE_KEY = 'nfl-ratings-datalake-v3'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 1 week

async function fetchLake(base: string): Promise<DataLake> {
  try {
    const res = await fetch(`${base}data/latest.json`, { cache: 'no-cache' })
    if (res.ok) {
      const payload = await res.json()
      if (payload?.players?.length) return applyValueGrades(payload as DataLake)
    }
  } catch {
    /* fall through */
  }

  const metaRes = await fetch(`${base}data/meta.json`, { cache: 'no-cache' })
  if (!metaRes.ok) throw new Error(`Failed to load data lake (${metaRes.status})`)
  const metaFile = await metaRes.json()
  const chunkCount = metaFile.playerChunks || 0
  const players: Player[] = []
  for (let i = 0; i < chunkCount; i++) {
    const r = await fetch(`${base}data/players-${i}.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(`Failed to load players chunk ${i}`)
    const part = await r.json()
    players.push(...part)
  }
  return applyValueGrades({
    meta: metaFile.meta,
    players,
    defenses: metaFile.defenses || [],
  })
}

export function useDataLake() {
  const [data, setData] = useState<DataLake | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; payload: DataLake }
          if (Date.now() - parsed.ts < CACHE_TTL_MS && parsed.payload?.players?.length) {
            if (!cancelled) {
              setData(applyValueGrades(parsed.payload))
              setLoading(false)
            }
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const base = import.meta.env.BASE_URL || '/'
        const payload = await fetchLake(base)
        if (!cancelled) {
          setData(payload)
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }))
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Unable to load player data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading, error }
}
