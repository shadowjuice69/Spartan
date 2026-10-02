"use client"

type CacheEntry = { at: number; promise: Promise<any> | null; value: any }

const entries = new Map<string, CacheEntry>()
const TTL_MS = 20_000

async function getJson(url: string) {
  const existing = entries.get(url)
  const now = Date.now()

  if (existing?.promise) return existing.promise
  if (existing?.value !== undefined && now - existing.at < TTL_MS) return existing.value

  const promise = fetch(url, { cache: "no-store", headers: { accept: "application/json" } })
    .then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`)
      entries.set(url, { at: Date.now(), promise: null, value: data })
      return data
    })
    .catch(error => {
      const current = entries.get(url)
      if (current?.promise) entries.delete(url)
      throw error
    })

  entries.set(url, { at: now, promise, value: existing?.value })
  return promise
}

export function getHistory(limit = 120) {
  return getJson(`/api/history?limit=${limit}`)
}

export function getKingdomData() {
  return getJson("/api/kingdom-data")
}

export function getEnemyIntel() {
  return getJson("/api/enemy-intel?summary=1")
}

export function getLatestIntel() {
  return getJson("/api/intel-data?section=intel")
}

export function getCommandIntel() {
  return Promise.all([getHistory(120), getKingdomData(), getEnemyIntel(), getLatestIntel()])
}
