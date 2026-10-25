'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { C, Empty, Grid, Panel, Shell, Skeletons } from '@/components/spartan/ui'
import PayoffPanel from '@/components/spartan/PayoffPanel'

type Body = {
  ok?: boolean
  province?: string
  kingdom?: string
  model?: {
    ownKd?: string
    ownName?: string
    kingdoms?: Array<{ kd: string; own?: boolean; capturedAt?: string; provinces: any[] }>
  }
  error?: string
}

export default function BestGainsPage() {
  const [body, setBody] = useState<Body | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = useCallback(() => setRefreshKey(v => v + 1), [])

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch('/api/page-models?page=intel', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json?.error || `Intel request failed (${response.status})`)
        return json as Body
      })
      .then(json => { if (live) setBody(json) })
      .catch(e => { if (live && e?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Unable to load kingdom Intel') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false; controller.abort() }
  }, [refreshKey])

  const model = body?.model
  const ownKd = model?.ownKd || body?.kingdom || ''
  const kingdoms = model?.kingdoms || []
  const mine = useMemo(() => kingdoms.find(k => k.kd === ownKd)?.provinces || [], [kingdoms, ownKd])
  const targets = useMemo(() => kingdoms.filter(k => k.kd !== ownKd).flatMap(k => k.provinces || []), [kingdoms, ownKd])

  return (
    <Shell
      title="Best Gains"
      eyebrow="SPARTAN // ATTACK PLANNER"
      subtitle="Choose the province attacking, scan captured enemy kingdom grids, and rank traditional-march land gains. War mode adjusts the estimate for war MAP."
      accent={C.lime}
      data={body}
      error={error}
      loading={loading}
      reload={reload}
    >
      {loading && !body ? <Skeletons count={5} /> : (
        <>
          <Grid>
            <Panel span={12} title="HOW TO USE" sub="A planning aid, not an automatic attack system">
              <p style={{ margin: 0, color: '#9eafbf', fontSize: 12, lineHeight: 1.7 }}>
                Select your attacking province and set MAP / war status. Targets are ranked using the latest captured land and networth values available from each enemy kingdom grid. Check target defense and Intel age before attacking; estimates do not guarantee a break or exact gains.
              </p>
            </Panel>
          </Grid>
          {targets.length ? (
            <Grid>
              <PayoffPanel provs={targets} mine={mine} ownName={model?.ownName || body?.province || null} ownKd={ownKd || null} />
            </Grid>
          ) : (
            <Grid>
              <Panel span={12}>
                <Empty title="No captured enemy kingdom grids yet" hint="Capture an enemy kingdom province grid with the Spartan scraper, then refresh Best Gains to rank its targets." />
              </Panel>
            </Grid>
          )}
        </>
      )}
    </Shell>
  )
}
