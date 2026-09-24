import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, service: 'spartan-intel-receiver', status: 'healthy' });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const { decodeRequest, handleCapture } = require('../../node_modules/utopia-nexus-bot/bot/services/universalReceiver');
    const form = new URLSearchParams(body);
    const expectedKey = process.env.INTEL_KEY || null;
    if (expectedKey && form.get('key') !== expectedKey) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const result = await handleCapture(decodeRequest(body));
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[SPARTAN /intel ERROR]', error?.stack || error?.message || error);
    return NextResponse.json({ ok: false, error: error?.message || 'Capture failed' }, { status: 500 });
  }
}
