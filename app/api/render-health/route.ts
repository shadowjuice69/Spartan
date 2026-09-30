import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'healthy',
    service: 'spartan',
    serviceName: process.env.RENDER_SERVICE_NAME || 'spartan',
    commit: process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null,
    checkedAt: new Date().toISOString(),
  })
}
