'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import {
  AllData, C, DataTable, Empty, Gauge, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'

const row = { display: 'grid', gap: 6, fontSize: 12, color: '#8597a8' } as const

export default function MagicPage() {
  const { data, error, loading, reload } = usePageModel('magic')
  const m = data?.model
  const h = m?.header
  const active: any[] = m?.active?.spells || []
  const castable: any[] = m?.castable || []
  const ritual = m?.ritual
  const project = m?.ritualProject
  const series: any[] = m?.series || []
  const uniques: any[] = m?.uniques || []
  const unknown: string[] = m?.unknown || []
  const effects: any[] = m?.ritualEffects || []
  const runes: number | null = h?.runes ?? null

  const activeNames = new Set(active.map(s => String(s.name).toLowerCase()))
  const missing = castable.filter(s => !activeNames.has(String(s.name).toLowerCase()))
  const byDays = [...active].sort((a, b) => a.days - b.days)
  const expiring = active.filter(s => s.days <= 2)
  const soonest = byDays[0] || null
  const hasAny = Boolean(h || active.length || ritual || project)
  const lineSeries = [
    { name: 'Runes', color: C.violet, format: compact, points: series.map(s => ({ x: s.at, y: s.runes })) },
  ]
  const wizardSeries = [
    { name: 'Wizards', color: C.cyan, format: compact, points: series.map(s => ({ x: s.at, y: s.wizards })) },
    { name: 'Mana %', color: C.amber, format: (v: number) => `${v}%`, points: series.map(s => ({ x: s.at, y: s.mana })) },
  ]
  const rawWpaSeries = [
    { name: 'Raw WPA', color: C.violet, format: (v: number) => v.toFixed(2), points: series.map(s => ({ x: s.at, y: s.rawWpa })) },
  ]

  return (
    <Shell title="Mystic Circle" eyebrow="SPARTAN // MAGIC INTELLIGENCE" accent={C.violet}
      subtitle="Your wizards, runes, the spells active on your province, what you could cast next and the state of your kingdom ritual, built from the Enchantment, Council Spells and Ritual pages you capture."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !hasAny && (
        <Panel><Empty title="No magic capture yet" hint="Open Enchantment (Self Spells), Council → Spells and the Ritual page in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>
      )}
      {hasAny && (
        <>
          <Grid>
            <Stat label="Wizards" value={h?.wizards} sub={h?.rawWpa != null ? `${h.rawWpa.toFixed(2)} raw · modified unavailable` : 'Modified WPA needs current modifiers'} color={C.violet} delay={0} />
            <Stat label="Runes" value={runes} sub={h?.mana != null ? `${h.mana}% mana` : undefined} color={C.cyan} delay={1} />
            <Stat label="Active spells" value={m?.active ? active.length : null}
              sub={soonest ? `Next to expire: ${soonest.name} (${soonest.days}d)` : undefined}
              color={expiring.length ? C.amber : C.green} delay={2} />
            <Stat label="Guilds" value={h?.guilds} sub={h?.guildPct != null ? `${h.guildPct}% of buildings` : undefined} color={C.lime} delay={3} />
          </Grid>

          <Grid>
            <Panel span={7} title="ACTIVE SPELLS" delay={1}
              sub={m?.active?.at ? `Captured ${ago(m.active.at)} · days remaining` : undefined}
              right={expiring.length ? <Tag color={C.amber}>{expiring.length} EXPIRING</Tag> : undefined}>
              {active.length ? (
                <>
                  <HBars max={Math.max(20, ...active.map(s => s.days))} format={v => `${v}d`}
                    items={byDays.map(s => ({ label: s.name, value: s.days, color: s.days <= 2 ? C.amber : C.violet, text: `${s.days}d` }))} />
                  <div style={{ ...row, marginTop: 10 }}>
                    {byDays.filter(s => s.effect).map(s => <div key={s.name}><b style={{ color: C.text }}>{s.name}</b> · {s.effect}</div>)}
                  </div>
                </>
              ) : <Empty title="No active spells in the latest capture" hint="Open Council → Spells in Utopia to refresh this list." />}
            </Panel>

            <Panel span={5} title="KINGDOM RITUAL" delay={2}
              sub={ritual?.at ? `Status captured ${ago(ritual.at)}` : project?.at ? `Project captured ${ago(project.at)}` : undefined}
              right={ritual?.name ? <Tag color={C.violet}>{String(ritual.name).toUpperCase()}</Tag> : undefined}>
              {ritual?.name || project?.name ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  {project?.casts != null && project?.castsNeeded != null && (
                    <Gauge value={project.casts} max={project.castsNeeded} label="RITUAL CASTS" color={C.violet}
                      text={`${project.casts}/${project.castsNeeded}`}
                      sub={project.casts > project.castsNeeded ? 'Over target: boosting' : 'Toward completion'} />
                  )}
                  <div style={row}>
                    {ritual?.name && <div><b style={{ color: C.text }}>{ritual.name}</b> · {fmt(ritual.effectiveness)}% effectiveness · started {ritual.startedDaysAgo}d ago · lifts in {ritual.liftedInDays}d</div>}
                    {ritual?.base && <div>{ritual.base}</div>}
                    {project?.castCost != null && <div>Next cast: {fmt(project.castCost)} runes at {project.castMana}% mana{runes != null ? (runes >= project.castCost ? ' · you can afford it' : ' · you are short on runes') : ''}</div>}
                    {project?.startEffectiveness != null && <div>Starts at {project.startEffectiveness}% effectiveness when activated</div>}
                  </div>
                </div>
              ) : <Empty title="No ritual capture yet" hint="Open the Ritual page in Utopia with the Spartan scraper running." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={7} title="NOT ACTIVE · COULD CAST" delay={3}
              sub={m?.castableAt ? `Spell list captured ${ago(m.castableAt)}` : undefined}
              right={missing.length ? <Tag color={C.cyan}>{missing.length} AVAILABLE</Tag> : undefined}>
              {castable.length ? (
                <DataTable<any> initialSort="cost" desc={false} maxHeight={360} columns={[
                  { key: 'name', label: 'SPELL', value: r => r.name },
                  { key: 'cost', label: 'RUNES', value: r => r.cost, render: r => fmt(r.cost), align: 'right' },
                  { key: 'days', label: 'LASTS', value: r => r.days, render: r => (r.days != null ? `${r.days}d` : 'Instant / varies'), align: 'right' },
                  { key: 'ok', label: 'NOW', value: r => (runes != null && r.cost <= runes ? 1 : 0),
                    render: r => (runes != null && r.cost <= runes ? <Tag color={C.green}>CAN CAST</Tag> : <Tag color={C.red}>SHORT</Tag>), align: 'right' },
                ]} rows={missing} empty="Every spell you can cast is already active." />
              ) : <Empty title="No spell list captured" hint="Open Enchantment (Self Spells) in Utopia to capture castable spells and their rune costs." />}
              {unknown.length > 0 && <div style={{ ...row, marginTop: 10 }}>Not known to your culture: {unknown.join(', ')}</div>}
            </Panel>

            <Panel span={5} title="UNIQUES" sub="Passive effects from your race and personality" delay={4}>
              {uniques.length ? (
                <div style={row}>
                  {uniques.map(u => <div key={u.name}><Tag color={u.kind === 'Race' ? C.cyan : C.pink}>{String(u.kind).toUpperCase()}</Tag> <b style={{ color: C.text }}>{u.name}</b></div>)}
                </div>
              ) : <Empty title="No uniques captured" hint="They appear on the Enchantment page." />}
            </Panel>
          </Grid>

          {series.length > 1 && (
            <Grid>
              <Panel span={6} title="RUNES OVER TIME" sub="From your Enchantment captures" delay={5}>
                <LineChart series={lineSeries} height={200} />
              </Panel>
              <Panel span={6} title="WIZARDS & MANA OVER TIME" delay={5}>
                <LineChart series={wizardSeries} height={200} />
              </Panel>
            </Grid>
          )}
          {series.filter(s => s.rawWpa != null).length > 1 && (
            <Grid>
              <Panel span={12} title="RAW WPA OVER TIME" sub="Wizards ÷ Land · Spartan Utopia wiki → All Formulas → Magic. Modified WPA is not inferred without complete modifiers." delay={6}>
                <LineChart series={rawWpaSeries} height={200} />
              </Panel>
            </Grid>
          )}

          {effects.length > 0 && (
            <Grid>
              <Panel span={12} title="ALL RITUALS" sub="What each ritual does" delay={6}>
                <DataTable<any> columns={[
                  { key: 'name', label: 'RITUAL', value: r => r.name, render: r => <b style={{ color: ritual?.name === r.name || project?.name === r.name ? C.violet : C.text }}>{r.name}</b> },
                  { key: 'effects', label: 'EFFECTS', value: r => r.effects },
                ]} rows={effects} />
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
