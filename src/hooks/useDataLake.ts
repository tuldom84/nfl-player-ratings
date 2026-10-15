import { useState, useEffect, useCallback } from 'react'
import type { DataLake, Player } from '../lib/types'
import { loadScoringSettings, SCORING_CHANGE_EVENT } from '../lib/scoringSettings'
import { applyScoringSettings } from '../lib/rescore'

const CACHE_KEY = 'nfl-ratings-datalake-v4'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 1 week

function withScoring(lake: DataLake): DataLake {
  const settings = loadScoringSettings()
  return applyScoringSettings(lake, settings)
}

export function useDataLake() {
  const [raw, setRaw] = useState<DataLake | null>(null)
  const [data, setData] = useState<DataLake | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((lake: DataLake) => {
    setRaw(lake)
    setData(withScoring(lake))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; payload: DataLake }
          if (
            Date.now() - parsed.ts < CACHE_TTL_MS &&
            parsed.payload?.players?.length &&
            (parsed.payload.teamOffenses?.length || 0) > 0
          ) {
            if (!cancelled) {
              apply(parsed.payload)
              setLoading(false)
            }
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const base = import.meta.env.BASE_URL || '/'
        const res = await fetch(`${base}data/latest.json`, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`Failed to load data (${res.status})`)
        const payload = (await res.json()) as DataLake
        if (!payload?.players?.length) throw new Error('Empty data lake')
        if (!cancelled) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }))
          apply(payload)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Unable to load player data'
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [apply])

  useEffect(() => {
    function onChange() {
      if (raw) setData(withScoring(raw))
    }
    window.addEventListener(SCORING_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(SCORING_CHANGE_EVENT, onChange)
  }, [raw])

  return { data, loading, error }
}
