import { NextResponse } from 'next/server';

// Lightweight liveness endpoint for Render and external smoke checks.
// Deliberately does not expose database status, environment values, or account data.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { ok: true, service: 'spartan-west', timestamp: new Date().toISOString() },
    { status: 200, headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}
