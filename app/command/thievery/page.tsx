'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import {
  AllData, C, DataTable, Empty, Grid, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'

const note = { fontSize: 12, color: '#8597a8', marginTop: 10 } as const
const tags = { display: 'flex', flexWrap: 'wrap', gap: 6 } as const

export default function ThieveryPage() {
  const { data, error, loading, reload } = usePageModel('thievery')
  const m = data?.model
  const h = m?.header
  const results: any[] = m?.results || []
  const series: any[] = m?.series || []
  const botResults: any[] = m?.botResults || []
  const targets = m?.targets
  const provs: any[] = targets?.provinces || []
  const uniques: any[] = m?.uniques || []
  const unknown: string[] = m?.unknown || []
  const forbidden: string[] = m?.forbidden || []
  const wins = results.filter(r => r.outcome === 'success').length
  const fails = results.filter(r => r.outcome === 'failed').length
  const lost = results.reduce((s, r) => s + (r.thievesLost || 0), 0)
  const hasAny = Boolean(h || results.length || m?.ops || botResults.length)

  const stealthSeries = [
    { name: 'Stealth %', color: C.cyan, format: (v: number) => `${v}%`, points: series.map(s => ({ x: s.at, y: s.stealth })) },
  ]
  const thiefSeries = [
    { name: 'Thieves', color: C.amber, format: compact, points: series.map(s => ({ x: s.at, y: s.thieves })) },
  ]
  const rawTpaSeries = [
    { name: 'Raw TPA', color: C.amber, format: (v: number) => v.toFixed(2), points: series.map(s => ({ x: s.at, y: s.rawTpa })) },
  ]

  return (
    <Shell title="Guild of Thieves" eyebrow="SPARTAN // THIEVERY INTELLIGENCE" accent={C.amber}
      subtitle="Your thieves, stealth, the operations open to you, the results of the operations you capture and your latest target list, built from the Thievery pages you open."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !hasAny && (
        <Panel><Empty title="No thievery capture yet" hint="Open Thievery in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>
      )}
      {hasAny && (
        <>
          <Grid>
            <Stat label="Thieves" value={h?.thieves} sub={h?.rawTpa != null ? `${h.rawTpa.toFixed(2)} raw TPA · modified unavailable${h.ratioAt ? ` · ${ago(h.ratioAt)}` : ''}` : 'Modified TPA needs current modifiers'} color={C.amber} delay={0} />
            <Stat label="Stealth" value={h?.stealth} format={v => `${v}%`} color={h?.stealth != null && h.stealth < 70 ? C.red : C.cyan} delay={1} />
            <Stat label="Operations captured" value={results.length} sub={results.length ? `${wins} succeeded${fails ? ` · ${fails} failed` : ''}` : undefined} color={C.green} delay={2} />
            <Stat label="Thieves lost" value={lost} sub="Across captured operations" color={lost ? C.red : C.lime} delay={3} />
          </Grid>

          <Grid>
            <Panel span={7} title="RECENT OPERATIONS" sub="Results of the operation pages you captured" delay={1}>
              {results.length ? (
                <DataTable<any> initialSort="at" maxHeight={380} columns={[
                  { key: 'at', label: 'WHEN', value: r => Date.parse(r.at) || 0, render: r => ago(r.at) },
                  { key: 'op', label: 'OPERATION', value: r => r.op },
                  { key: 'target', label: 'TARGET', value: r => `${r.province ?? ''} ${r.kingdom ?? ''}`.trim(), render: r => [r.province, r.kingdom ? `(${r.kingdom})` : null].filter(Boolean).join(' ') || '—' },
                  { key: 'outcome', label: 'RESULT', value: r => r.outcome,
                    render: r => <Tag color={r.outcome === 'success' ? C.green : r.outcome === 'failed' ? C.red : C.mute}>{String(r.outcome).toUpperCase()}{r.confidence != null ? ` · ${r.confidence}%` : ''}</Tag> },
                  { key: 'lost', label: 'LOST', value: r => r.thievesLost, render: r => fmt(r.thievesLost), align: 'right' },
                ]} rows={results} />
              ) : <Empty title="No operation results captured" hint="Run an operation in Utopia with the scraper running and its result shows up here." />}
            </Panel>

            {botResults.length > 0 && (
              <Panel span={12} title="DISCORD BOT OPERATION REPORTS" sub="Kingdom thievery results with original Discord message provenance" delay={2}>
                <DataTable<any> initialSort="at" maxHeight={380} columns={[
                  { key: 'at', label: 'WHEN', value: r => Date.parse(r.at) || 0, render: r => ago(r.at) },
                  { key: 'actor', label: 'PROVINCE', value: r => r.actor },
                  { key: 'op', label: 'OPERATION', value: r => r.op },
                  { key: 'target', label: 'TARGET', value: r => `${r.province || ''} ${r.kingdom ? `(${r.kingdom})` : ''}`.trim() },
                  { key: 'sent', label: 'THIEVES SENT', value: r => r.thievesSent ?? -1, render: r => r.thievesSent == null ? '—' : fmt(r.thievesSent), align: 'right' },
                  { key: 'tpa', label: 'TARGET TPA', value: r => r.targetTpa ?? -1, render: r => r.targetTpa == null ? '—' : `${r.targetTpa.toFixed(2)}${r.targetModifiedTpa != null ? ` (m.${r.targetModifiedTpa.toFixed(2)})` : ''}`, align: 'right' },
                  { key: 'outcome', label: 'RESULT', value: r => r.outcome, render: r => <Tag color={r.outcome === 'success' ? C.green : r.outcome === 'failed' ? C.red : C.mute}>{String(r.outcome).toUpperCase()}</Tag> },
                  { key: 'message', label: 'DISCORD MSG', value: r => r.sourceId, render: r => <span title={r.sourceId}>{String(r.sourceId || '').slice(-8) || '—'}</span> },
                ]} rows={botResults} />
              </Panel>
            )}
            <Panel span={5} title="AVAILABLE OPERATIONS" delay={2}
              sub={m?.ops?.at ? `Captured ${ago(m.ops.at)}` : undefined}>
              {m?.ops ? (
                <>
                  <div style={{ fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0', marginBottom: 6 }}>INTELLIGENCE</div>
                  <div style={tags}>{m.ops.intel.map((o: string) => <Tag key={o} color={C.cyan}>{o}</Tag>)}</div>
                  <div style={{ fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0', margin: '12px 0 6px' }}>HOSTILE</div>
                  <div style={tags}>{m.ops.hostile.map((o: string) => <Tag key={o} color={C.red}>{o}</Tag>)}</div>
                  {forbidden.length > 0 && <div style={note}>Forbidden for diplomatic reasons: {forbidden.join(', ')}</div>}
                  {unknown.length > 0 && <div style={{ ...note, marginTop: 4 }}>Not known to your culture: {unknown.join(', ')}</div>}
                </>
              ) : <Empty title="No operation list captured" hint="Open the Thievery page itself in Utopia." />}
              {uniques.length > 0 && (
                <div style={{ ...note, display: 'grid', gap: 4 }}>
                  {uniques.map(u => <div key={u.name}><Tag color={u.kind === 'Race' ? C.cyan : C.pink}>{String(u.kind).toUpperCase()}</Tag> <b style={{ color: C.text }}>{u.name}</b></div>)}
                </div>
              )}
            </Panel>
          </Grid>

          {series.length > 1 && (
            <Grid>
              <Panel span={6} title="STEALTH OVER TIME" sub="Drops after operations, recovers with time" delay={3}>
                <LineChart series={stealthSeries} height={200} />
              </Panel>
              <Panel span={6} title="THIEVES OVER TIME" delay={3}>
                <LineChart series={thiefSeries} height={200} />
              </Panel>
            </Grid>
          )}
          {series.filter(s => s.rawTpa != null).length > 1 && (
            <Grid>
              <Panel span={12} title="RAW TPA OVER TIME" sub="Thieves ÷ Land · Spartan Utopia wiki → All Formulas → Thievery. Modified TPA is not inferred without complete modifiers." delay={4}>
                <LineChart series={rawTpaSeries} height={200} />
              </Panel>
            </Grid>
          )}

          {provs.length > 0 && (
            <Grid>
              <Panel span={12} title="LAST TARGET LIST" delay={4}
                sub={`${targets.kingdom ?? 'Kingdom'} ${targets.code ? `(${targets.code})` : ''}${targets.own ? ' · your own kingdom' : ''} · captured ${ago(targets.at)}`}>
                <DataTable<any> initialSort="slot" desc={false} maxHeight={360} columns={[
                  { key: 'slot', label: 'SLOT', value: r => r.slot, align: 'right' },
                  { key: 'name', label: 'PROVINCE', value: r => r.name },
                  { key: 'size', label: 'SIZE VS YOU', value: r => r.size, render: r => `${r.size}%`, align: 'right' },
                ]} rows={provs} />
              </Panel>
            </Grid>
          )}
        </>
      )}
      <JeevesSummary compact />
      {data && <AllData fields={data.fields} captures={data.captures} />}
    </Shell>
  )
}
