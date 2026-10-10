const baseUrl = String(process.env.SPARTAN_DASHBOARD_URL || 'https://sparta-west.onrender.com').replace(/\/$/, '')
const key = process.env.SPARTAN_STEWARD_KEY
const intervalMs = Math.max(Number(process.env.SPARTAN_STORAGE_STEWARD_INTERVAL_MS || 300000) || 300000, 30000)
const limit = Math.min(Math.max(Number(process.env.SPARTAN_STORAGE_STEWARD_BATCH || 3) || 3, 1), 25)

if (!key) {
  console.error('[storage-steward] SPARTAN_STEWARD_KEY is not configured')
  process.exit(1)
}

let stopping = false

async function cycle() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)
  try {
    const response = await fetch(baseUrl + '/api/internal-storage/process', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-spartan-steward-key': key,
      },
      body: JSON.stringify({ limit }),
      signal: controller.signal,
    })
    const bodyText = await response.text()
    let payload
    try { payload = JSON.parse(bodyText) } catch { payload = { raw: bodyText } }
    if (!response.ok || payload?.ok !== true) {
      console.error('[storage-steward] cycle failed', response.status, JSON.stringify(payload))
      return
    }
    console.log('[storage-steward] cycle complete', JSON.stringify({
      requested: payload.requested,
      staged: payload.staged,
      processed: payload.processed,
      failed: payload.failed,
    }))
    if (Array.isArray(payload.failures) && payload.failures.length) {
      console.error('[storage-steward] item failures', JSON.stringify(payload.failures))
    }
  } catch (error) {
    console.error('[storage-steward] request error', error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  console.log('[storage-steward] starting', JSON.stringify({ baseUrl, intervalMs, limit, startupDelayMs: 30000 }))
  // Let Next.js finish binding its port before the first internal API request.
  await new Promise(resolve => setTimeout(resolve, 30_000))
  while (!stopping) {
    await cycle()
    if (stopping) break
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

function stop() {
  stopping = true
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

main().catch(error => {
  console.error('[storage-steward] fatal error', error)
  process.exit(1)
})
