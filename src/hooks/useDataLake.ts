import { useState, useEffect } from 'react'
import type { DataLake } from '../lib/types'

const CACHE_KEY = 'nfl-ratings-datalake'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 1 week

export function useDataLake() {
  const [data, setData] = useState<DataLake | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      // 1. Try localStorage cache first (offline-friendly)
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; payload: DataLake }
          if (Date.now() - parsed.ts < CACHE_TTL_MS) {
            if (!cancelled) {
              setData(parsed.payload)
              setLoading(false)
            }
            // Still attempt a background refresh if online
          }
        }
      } catch {
        // ignore corrupt cache
      }

      // 2. Fetch from static data lake (updated weekly on Tuesday)
      try {
        const res = await fetch('/data/latest.json', { cache: 'default' })
        if (!res.ok) throw new Error(`Failed to load data lake (${res.status})`)
        const payload: DataLake = await res.json()
        if (!cancelled) {
          setData(payload)
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }))
        }
      } catch (e: any) {
        if (!cancelled && !data) {
          setError(e.message || 'Unable to load player data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { data, loading, error }
}
