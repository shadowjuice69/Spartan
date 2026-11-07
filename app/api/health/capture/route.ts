import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServiceClient();
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('id,province_name,province_location,account_status')
      .eq('auth_user_id', user.id)
      .eq('account_status', 'active')
      .maybeSingle();

    if (accountError) throw new Error(accountError.message);
    if (!account) return NextResponse.json({ error: 'Active Spartan account not found.' }, { status: 403 });

    const [captureResult, flowResult] = await Promise.all([
      db.from('spartan_capture_vault')
        .select('capture_id,source,page_kind,captured_at')
        .eq('province_id', account.id)
        .order('captured_at', { ascending: false })
        .limit(500),
      db.from('spartan_data_flow')
        .select('flow_id,source,page_kind,status,created_at,processed_at')
        .eq('province_id', account.id)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (captureResult.error) throw new Error(captureResult.error.message);
    if (flowResult.error) throw new Error(flowResult.error.message);

    const captures = captureResult.data || [];
    const flows = flowResult.data || [];
    const pageKinds = new Map<string, { source: string; pageKind: string; count: number; latestAt: string | null }>();

    for (const row of captures) {
      const source = String(row.source || 'unknown');
      const pageKind = String(row.page_kind || 'unknown');
      const key = source + ':' + pageKind;
      const current = pageKinds.get(key) || { source, pageKind, count: 0, latestAt: null };
      current.count += 1;
      if (!current.latestAt || String(row.captured_at || '') > current.latestAt) current.latestAt = row.captured_at;
      pageKinds.set(key, current);
    }

    const flowStatuses: Record<string, number> = {};
    for (const flow of flows) {
      const status = String(flow.status || 'unknown');
      flowStatuses[status] = (flowStatuses[status] || 0) + 1;
    }

    const flowIds = flows.map(flow => flow.flow_id).filter(Boolean);
    let queueStatuses: Record<string, number> = {};
    let staleProcessing = 0;
    let failedQueue = 0;
    if (flowIds.length) {
      const { data: queueRows, error: queueError } = await db
        .from('spartan_processing_queue')
        .select('status,locked_at,attempts,created_at')
        .in('flow_id', flowIds);
      if (queueError) throw new Error(queueError.message);
      const staleCutoff = Date.now() - 30 * 60 * 1000;
      for (const row of queueRows || []) {
        const status = String(row.status || 'unknown');
        queueStatuses[status] = (queueStatuses[status] || 0) + 1;
        if (status === 'failed') failedQueue += 1;
        if (status === 'processing' && row.locked_at && Date.parse(row.locked_at) < staleCutoff) staleProcessing += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      province: account.province_name,
      kingdom: account.province_location,
      generatedAt: new Date().toISOString(),
      sample: { captures: captures.length, flows: flows.length },
      lastCaptureAt: captures[0]?.captured_at || null,
      capturesByPage: [...pageKinds.values()].sort((a, b) => String(b.latestAt || '').localeCompare(String(a.latestAt || ''))),
      flowStatuses,
      queueStatuses,
      staleProcessing,
      failedQueue,
    }, { headers: { 'cache-control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[SPARTAN HEALTH] capture health query failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unable to load Spartan capture health.' }, { status: 500 });
  }
}
