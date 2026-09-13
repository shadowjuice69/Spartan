import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RENDER_URL = process.env.SPIRIT_RENDER_HEALTH_URL || 'https://utopia-nexus.onrender.com/health'

export async function GET() {
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(RENDER_URL, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const latencyMs = Date.now() - started
    let body: Record<string, unknown> = {}
    try { body = await response.json() } catch { body = {} }

    return NextResponse.json({
      ok: response.ok,
      status: response.ok ? 'healthy' : 'degraded',
      httpStatus: response.status,
      latencyMs,
      render: body,
      checkedAt: new Date().toISOString(),
    }, { status: response.ok ? 200 : 503 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: 'offline',
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Render health check failed',
      checkedAt: new Date().toISOString(),
    }, { status: 503 })
  } finally {
    clearTimeout(timeout)
  }
}
