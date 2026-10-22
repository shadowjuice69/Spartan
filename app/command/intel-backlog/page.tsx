'use client'

import { useCallback, useEffect, useState } from 'react'
import { C, Empty, Grid, Panel, Shell, Skeletons, Stat, Tag, ago } from '@/components/spartan/ui'

type BacklogRow = {
  vaultId: number | string
  captureId: string
  capturedAt: string
  rawText: string
  hasFlow: boolean
  hasIntel: boolean
  intelId: string | number | null
  pageKind: string
  status: 'missing_projection' | 'needs_classification' | 'routed'
  isOperation: boolean
  destination: string
  consumers: string[]
  confidence: number | null
  reason: string
}
type Model = {
  generatedAt: string
  kingdom: string
  province: string
  counts: { visible: number; missingProjection: number; needsClassification: number; routed: number; operationCaptures: number }
  rows: BacklogRow[]
}

const panelStyle = { background: 'rgba(15,22,31,.82)', border: '1px solid rgba(139,160,180,.17)', borderRadius: 12, padding: 16 } as const
const muted = { color: '#91a1b2', fontSize: 12 } as const
const buttonStyle = { border: '1px solid rgba(139,160,180,.3)', borderRadius: 8, padding: '8px 12px', background: 'rgba(139,160,180,.08)', color: 'inherit', cursor: 'pointer', fontSize: 12 } as const

export default function IntelBacklogPage() {
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/intel-backlog', { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not load Intel backlog')
      setModel(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Intel backlog')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const rows = (model?.rows || []).filter(row => filter === 'all' || row.status === filter || (filter === 'operations' && row.isOperation))
  return (
    <Shell title="Intel Backlog" eyebrow="SPARTAN // BACKLOG STEWARD" accent={C.cyan}
      subtitle="A traceable recovery queue for captured Discord Intel. Originals remain in the vault; this view identifies missing projections and unclassified messages."
      data={model} loading={loading} error={error} reload={load}>
      {!model && loading && <Skeletons count={5} />}
      {model && (
        <>
          <Grid>
            <Stat label="Operation captures" value={model.counts.operationCaptures} sub="Matched operation-message markers" color={C.cyan} delay={0} />
            <Stat label="Missing projections" value={model.counts.missingProjection} sub="Capture has no matching Intel record" color={model.counts.missingProjection ? C.red : C.green} delay={1} />
            <Stat label="Needs classification" value={model.counts.needsClassification} sub="Fallback or unknown category" color={model.counts.needsClassification ? C.amber : C.green} delay={2} />
            <Stat label="Routed captures" value={model.counts.routed} sub="No unresolved status detected" color={C.green} delay={3} />
          </Grid>

          <Panel title="DESTINATION REGISTRY" sub={`Current kingdom: ${model.kingdom} · refreshed ${ago(model.generatedAt)}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              {[
                ['Magic', 'Magic Intel · province magic data'],
                ['Thievery', 'Thievery Intel · operation history'],
                ['Attacks / News', 'News · War Room · Military'],
                ['Science', 'Science Intel · calculator inputs'],
                ['Buildings / Survey', 'Buildings · Build Lab inputs'],
                ['Rituals / Aid / Dragons', 'Category-specific Intel views'],
                ['Unknown', 'Needs classification and destination review'],
              ].map(([name, destination]) => (
                <div key={name} style={{ ...panelStyle, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
                  <div style={{ ...muted, marginTop: 6 }}>{destination}</div>
                </div>
              ))}
            </div>
            <p style={{ ...muted, marginTop: 12 }}>This is a diagnostic registry based on existing Spartan categories. It does not create parallel storage or write/delete Intel.</p>
          </Panel>

          <Panel title="RECOVERY QUEUE" sub={`${rows.length} visible records · originals preserved · read-only in this first pass`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[
                ['all', 'All unresolved'],
                ['missing_projection', 'Missing projection'],
                ['needs_classification', 'Needs classification'],
                ['operations', 'Operation captures'],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} style={{ ...buttonStyle, borderColor: filter === value ? C.cyan : 'rgba(139,160,180,.3)', background: filter === value ? 'rgba(90,210,230,.12)' : buttonStyle.background }}>{label}</button>
              ))}
              <button type="button" onClick={() => void load()} style={{ ...buttonStyle, marginLeft: 'auto' }}>Refresh audit</button>
            </div>
            {!rows.length ? <Empty title="No unresolved captures in this view" hint="The audit is scoped to your kingdom and the currently retained capture/projection records." /> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 12 }}>
                  <thead><tr>{['CAPTURED', 'STATUS', 'DESTINATION', 'CAPTURE / REASON'].map(label => <th key={label} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid rgba(139,160,180,.2)', color: '#91a1b2', fontSize: 10, letterSpacing: '.08em' }}>{label}</th>)}</tr></thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={String(row.vaultId)}>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid rgba(139,160,180,.1)', whiteSpace: 'nowrap' }}>{ago(row.capturedAt)}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid rgba(139,160,180,.1)' }}>
                          <Tag color={row.status === 'missing_projection' ? C.red : row.status === 'needs_classification' ? C.amber : C.green}>{row.status === 'missing_projection' ? 'MISSING' : row.status === 'needs_classification' ? 'REVIEW' : 'ROUTED'}</Tag>
                          {row.isOperation && <div style={{ ...muted, marginTop: 5 }}>Operation capture</div>}
                        </td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid rgba(139,160,180,.1)' }}>
                          <div style={{ fontWeight: 700 }}>{row.destination}</div>
                          <div style={muted}>{row.consumers.join(' · ')}</div>
                        </td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid rgba(139,160,180,.1)', maxWidth: 520 }}>
                          <div style={{ overflowWrap: 'anywhere', color: '#dce5ed' }}>{row.rawText || '(empty capture text)'}</div>
                          <div style={{ ...muted, marginTop: 5 }}>Vault #{row.vaultId} · {row.captureId}</div>
                          <div style={{ ...muted, marginTop: 4 }}>{row.reason}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </Shell>
  )
}
