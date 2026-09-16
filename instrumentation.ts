const WORKER_INTERVAL_MS = 2 * 60 * 1000

declare global {
  // eslint-disable-next-line no-var
  var __spartanStorageStewardStarted: boolean | undefined
  // eslint-disable-next-line no-var
  var __spartanStorageStewardTimer: ReturnType<typeof setInterval> | undefined
}

async function runStorageSteward() {
  const baseUrl = String(process.env.SPARTAN_DASHBOARD_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
  const key = process.env.SPARTAN_STEWARD_KEY
  if (!key) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(`${baseUrl}/api/internal-storage/process`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-spartan-steward-key': key,
      },
      body: JSON.stringify({ limit: 10 }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.ok !== true) {
      console.error('[storage-steward] background cycle failed', response.status, payload)
      return
    }
    if ((payload.staged ?? 0) > 0 || (payload.processed ?? 0) > 0 || (payload.failed ?? 0) > 0) {
      console.log('[storage-steward] background cycle', JSON.stringify({ staged: payload.staged, processed: payload.processed, failed: payload.failed }))
    }
  } catch (error) {
    console.error('[storage-steward] background cycle error', error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timeout)
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (globalThis.__spartanStorageStewardStarted) return
  globalThis.__spartanStorageStewardStarted = true

  // Give Next.js time to finish binding the HTTP server before the first cycle.
  setTimeout(() => void runStorageSteward(), 30_000)
  globalThis.__spartanStorageStewardTimer = setInterval(() => void runStorageSteward(), WORKER_INTERVAL_MS)
}
