const baseUrl = String(process.env.SPARTAN_DASHBOARD_URL || 'https://sparta-west.onrender.com').replace(/\/$/, '')
const key = process.env.SPARTAN_STEWARD_KEY
const limit = Math.min(Math.max(Number(process.env.SPARTAN_STEWARD_BATCH || 10) || 10, 1), 25)

if (!key) {
  console.error('[storage-steward] SPARTAN_STEWARD_KEY is not configured')
  process.exit(1)
}

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 120_000)

try {
  const response = await fetch(`${baseUrl}/api/internal-storage/process`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-spartan-steward-key': key,
    },
    body: JSON.stringify({ limit }),
    signal: controller.signal,
  })

  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = { raw: text } }

  if (!response.ok || payload?.ok !== true) {
    console.error('[storage-steward] processing failed', response.status, JSON.stringify(payload))
    process.exit(1)
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
  process.exit(1)
} finally {
  clearTimeout(timeout)
}
