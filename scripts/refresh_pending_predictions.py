#!/usr/bin/env python3
"""Patch updatePredictionHistory so pending current-week preds refresh."""
from pathlib import Path

p = Path('scripts/sync-data.mjs')
t = p.read_text()

old = '''async function updatePredictionHistory(previousPredictions, lake, currentSchedule, now) {
  const predictions = [...previousPredictions]
  const byEvent = new Set(
    predictions.map((prediction) => `${prediction.season}:${prediction.eventId}`)
  )

  const pendingSchedules = new Set(
    predictions
      .filter((prediction) => prediction.actualHomeScore == null || prediction.actualAwayScore == null)
      .map((prediction) => `${prediction.season}:${prediction.week}`)
  )
  const schedules = new Map([[`${SEASON}:${lake.meta.projectionWeek}`, currentSchedule]])
  for (const key of pendingSchedules) {
    if (!schedules.has(key)) {
      const [season, week] = key.split(':').map(Number)
      schedules.set(key, await loadMatchups(week, season))
    }
  }

  for (const prediction of predictions) {
    if (prediction.actualHomeScore != null && prediction.actualAwayScore != null) continue
    const game = schedules
      .get(`${prediction.season}:${prediction.week}`)
      ?.games.find((item) => item.eventId === prediction.eventId)
    if (game?.completed && game.homeScore != null && game.awayScore != null) {
      prediction.actualHomeScore = game.homeScore
      prediction.actualAwayScore = game.awayScore
    }
  }

  const normalizedLake = applyScoringSettings(lake, defaultSettings())
  for (const projected of projectWeekGames(normalizedLake)) {
    const game = currentSchedule.games.find(
      (item) => item.home === projected.home && item.away === projected.away && item.pregame
    )
    if (!game?.eventId || byEvent.has(`${SEASON}:${game.eventId}`)) continue
    byEvent.add(`${SEASON}:${game.eventId}`)
    predictions.push({
      season: SEASON,
      week: lake.meta.projectionWeek,
      eventId: game.eventId,
      predictedAt: now.toISOString(),
      home: projected.home,
      away: projected.away,
      predictedHomeScore: projected.homeScore,
      predictedAwayScore: projected.awayScore,
      marketHomeSpread: game.marketHomeSpread,
      marketTotal: game.marketTotal,
      oddsProvider: game.oddsProvider,
    })
  }
  return predictions
}'''

new = '''async function updatePredictionHistory(previousPredictions, lake, currentSchedule, now) {
  const predictions = [...previousPredictions]
  const byEvent = new Map(
    predictions.map((prediction) => [`${prediction.season}:${prediction.eventId}`, prediction])
  )

  const pendingSchedules = new Set(
    predictions
      .filter((prediction) => prediction.actualHomeScore == null || prediction.actualAwayScore == null)
      .map((prediction) => `${prediction.season}:${prediction.week}`)
  )
  const schedules = new Map([[`${SEASON}:${lake.meta.projectionWeek}`, currentSchedule]])
  for (const key of pendingSchedules) {
    if (!schedules.has(key)) {
      const [season, week] = key.split(':').map(Number)
      schedules.set(key, await loadMatchups(week, season))
    }
  }

  // Fill in final scores for any still-pending predictions
  for (const prediction of predictions) {
    if (prediction.actualHomeScore != null && prediction.actualAwayScore != null) continue
    const game = schedules
      .get(`${prediction.season}:${prediction.week}`)
      ?.games.find((item) => item.eventId === prediction.eventId)
    if (game?.completed && game.homeScore != null && game.awayScore != null) {
      prediction.actualHomeScore = game.homeScore
      prediction.actualAwayScore = game.awayScore
    }
  }

  // Create or refresh predictions for current projection-week pregame matchups.
  // Pending (not final) rows are updated so the log tracks the latest model when
  // injuries / algorithm / data change mid-week. Finals are left locked.
  const normalizedLake = applyScoringSettings(lake, defaultSettings())
  let created = 0
  let refreshed = 0
  for (const projected of projectWeekGames(normalizedLake)) {
    const game = currentSchedule.games.find(
      (item) => item.home === projected.home && item.away === projected.away && item.pregame
    )
    if (!game?.eventId) continue
    const key = `${SEASON}:${game.eventId}`
    const existing = byEvent.get(key)
    if (existing && existing !== true) {
      // Only rewrite while still pending (no actuals yet)
      if (existing.actualHomeScore == null && existing.actualAwayScore == null) {
        existing.predictedHomeScore = projected.homeScore
        existing.predictedAwayScore = projected.awayScore
        existing.predictedAt = now.toISOString()
        existing.week = lake.meta.projectionWeek
        if (game.marketHomeSpread != null) existing.marketHomeSpread = game.marketHomeSpread
        if (game.marketTotal != null) existing.marketTotal = game.marketTotal
        if (game.oddsProvider) existing.oddsProvider = game.oddsProvider
        refreshed++
      }
      continue
    }
    byEvent.set(key, true)
    predictions.push({
      season: SEASON,
      week: lake.meta.projectionWeek,
      eventId: game.eventId,
      predictedAt: now.toISOString(),
      home: projected.home,
      away: projected.away,
      predictedHomeScore: projected.homeScore,
      predictedAwayScore: projected.awayScore,
      marketHomeSpread: game.marketHomeSpread,
      marketTotal: game.marketTotal,
      oddsProvider: game.oddsProvider,
    })
    created++
  }
  console.log('Predictions: created', created, 'refreshed pending', refreshed, 'total', predictions.length)
  return predictions
}'''

if old not in t:
    if 'refreshed pending' in t:
        print('already patched')
        raise SystemExit(0)
    raise SystemExit('pattern not found in sync-data.mjs')

p.write_text(t.replace(old, new, 1))
print('patched sync-data.mjs')
