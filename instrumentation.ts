const WORKER_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.SPARTAN_STORAGE_STEWARD_INTERVAL_MS || 300_000) || 300_000,
)
const WORKER_BATCH_SIZE = Math.min(
  25,
  Math.max(1, Number(process.env.SPARTAN_STORAGE_STEWARD_BATCH || 3) || 3),
)

declare global {
  // eslint-disable-next-line no-var
  var __spartanStorageStewardStarted: boolean | undefined
  // eslint-disable-next-line no-var
  var __spartanStorageStewardTimer: ReturnType<typeof setInterval> | undefined
  // eslint-disable-next-line no-var
  var __spartanStorageStewardRunning: boolean | undefined
}

async function runStorageSteward() {
  // Never allow two Steward batches to overlap on the same process.
  if (globalThis.__spartanStorageStewardRunning) {
    console.log('[storage-steward] cycle skipped; previous batch is still running')
    return
  }

  globalThis.__spartanStorageStewardRunning = true
  const baseUrl = String(process.env.SPARTAN_DASHBOARD_URL || 'http://127.0.0.1:3000').replace(/\\/$/, '')
  const key = process.env.SPARTAN_STEWARD_KEY
  if (!key) {
    console.error('[storage-steward] SPARTAN_STEWARD_KEY is not configured')
    globalThis.__spartanStorageStewardRunning = false
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(`${baseUrl}/api/internal-storage/process`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-spartan-steward-key': key,
      },
      body: JSON.stringify({ limit: WORKER_BATCH_SIZE }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.ok !== true) {
      console.error('[storage-steward] background cycle failed', response.status, payload)
      return
    }
    console.log('[storage-steward] background cycle', JSON.stringify({
      batchSize: WORKER_BATCH_SIZE,
      intervalMs: WORKER_INTERVAL_MS,
      staged: payload.staged ?? 0,
      processed: payload.processed ?? 0,
      failed: payload.failed ?? 0,
    }))
  } catch (error) {
    console.error('[storage-steward] background cycle error', error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timeout)
    globalThis.__spartanStorageStewardRunning = false
  }
}

export async function register() {
  if (globalThis.__spartanStorageStewardStarted) return
  globalThis.__spartanStorageStewardStarted = true

  // Give Next.js time to finish binding the HTTP server before the first cycle.
  setTimeout(() => void runStorageSteward(), 30_000)
  globalThis.__spartanStorageStewardTimer = setInterval(() => void runStorageSteward(), WORKER_INTERVAL_MS)
}
