'use client';

import { useCallback, useEffect, useState } from 'react';
import { C, Empty, Grid, Panel, Shell, Skeletons, Stat, Tag, ago, fmt } from '@/components/spartan/ui';

type CapturePage = { source: string; pageKind: string; count: number; latestAt: string | null };
type HealthModel = {
  ok: boolean;
  province: string;
  kingdom: string;
  generatedAt: string;
  sample: { captures: number; flows: number };
  lastCaptureAt: string | null;
  capturesByPage: CapturePage[];
  flowStatuses: Record<string, number>;
  openFlowCount: number;
  queueStatuses: Record<string, number>;
  staleProcessing: number;
  failedQueue: number;
};

const statusColor = (status: string) => {
  if (status === 'completed' || status === 'processed') return C.green;
  if (status === 'failed') return C.red;
  if (status === 'processing' || status === 'retry') return C.amber;
  return C.cyan;
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/health/capture', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body as HealthModel);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load capture health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 300000);
    return () => clearInterval(timer);
  }, [load]);

  const hasData = Boolean(data && (data.sample.captures || data.sample.flows));
  return (
    <Shell
      title="System Health"
      eyebrow="SPARTAN // OPERATIONS"
      accent={C.cyan}
      subtitle="Capture freshness and processing status for your province. This view is account-scoped and refreshes every five minutes."
      data={data}
      error={error}
      loading={loading}
      reload={load}
    >
      {!data && loading && <Skeletons count={4} />}
      {data && (
        <>
          <Grid>
            <Stat label="Recent captures" value={data.sample.captures} sub="Latest 500 capture receipts" color={C.cyan} />
            <Stat label="Recent flows" value={data.sample.flows} sub="Latest 500 processing flows" color={C.violet} />
            <Stat label="Stale processing" value={data.staleProcessing} sub="Locked longer than 30 minutes" color={data.staleProcessing ? C.red : C.green} />
            <Stat label="Failed queue" value={data.failedQueue} sub="Failed items in this sample" color={data.failedQueue ? C.red : C.green} />
          </Grid>

          <Grid>
            <Panel title="CAPTURE FRESHNESS" sub={data.lastCaptureAt ? `Latest receipt ${ago(data.lastCaptureAt)}` : 'No capture receipts found'} span={7}>
              {data.capturesByPage.length ? (
                <div style={{ display: 'grid', gap: 9 }}>
                  {data.capturesByPage.map(row => (
                    <div key={row.source + ':' + row.pageKind} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,1fr) auto minmax(100px,1fr)', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                      <div>
                        <b style={{ fontSize: 12, color: '#e7eef5' }}>{row.pageKind}</b>
                        <div style={{ fontSize: 10, color: '#8597a8' }}>{row.source}</div>
                      </div>
                      <Tag color={C.cyan}>{fmt(row.count)} recent</Tag>
                      <div style={{ textAlign: 'right', fontSize: 11, color: '#9fb0c0' }}>
                        {row.latestAt ? <><b>{ago(row.latestAt)}</b><div>{new Date(row.latestAt).toLocaleString()}</div></> : 'Never'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No captures yet" hint="Run the Spartan capture extension on your Utopia pages to begin filling this panel." />}
            </Panel>

            <Panel title="PROCESSING QUEUE" sub="Queue items associated with your recent flows" span={5}>
              {Object.keys(data.queueStatuses).length ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {Object.entries(data.queueStatuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <Tag color={statusColor(status)}>{status}</Tag>
                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(count)}</b>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No queue records" hint="Queue activity will appear when captures are accepted for processing." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel title="DATA FLOW STATUS" sub={`Recent flow sample · ${fmt(data.openFlowCount)} open/failed flows across the account`}>
              {Object.keys(data.flowStatuses).length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {Object.entries(data.flowStatuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                    <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, background: 'rgba(255,255,255,.025)' }}>
                      <Tag color={statusColor(status)}>{status}</Tag>
                      <b>{fmt(count)}</b>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No data flows" hint="New processing flows will appear here after capture." />}
            </Panel>
          </Grid>
          <div style={{ fontSize: 10, color: '#6f8091', textAlign: 'right' }}>Sample generated {new Date(data.generatedAt).toLocaleString()}</div>
        </>
      )}
      {data && !hasData && !loading && <Panel><Empty title="Waiting for the first capture" hint="The health monitor is active. Once Spartan receives your first capture, freshness and queue details will appear here." /></Panel>}
    </Shell>
  );
}
