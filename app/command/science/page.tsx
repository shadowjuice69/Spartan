'use client'

import {
  AllData, C, DataTable, Donut, Empty, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, signed, usePageModel,
} from '@/components/spartan/ui'

const CAT_COLOR: Record<string, string> = { Economy: C.lime, Military: C.red, 'Arcane Arts': C.violet }
const asPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

export default function SciencePage() {
  const { data, error, loading, reload } = usePageModel('science')
  const m = data?.model
  const cats: any[] = m?.current?.categories || []
  const all = cats.flatMap(c => c.items.map((i: any) => ({ ...i, category: c.name })))
  const totalBooks = cats.reduce((s, c) => s + c.totalBooks, 0)
  const scientists = cats.reduce((s, c) => s + c.scientists, 0)
  const booksAvailable = cats.reduce((s, c) => s + c.booksAvailable, 0)
  const best = all.length ? all.reduce((a, b) => (b.effect > a.effect ? b : a)) : null
  const worst = all.length ? all.reduce((a, b) => (b.effect < a.effect ? b : a)) : null
  const series: any[] = m?.series || []
  const lineSeries = ['Economy', 'Military', 'Arcane Arts'].map(name => ({
    name, color: CAT_COLOR[name], format: compact,
    points: series.map(s => ({ x: s.at, y: s.categories.find((c: any) => c.name === name)?.books ?? null })),
  }))

  return (
    <Shell title="Science Lab" eyebrow="SPARTAN // ARTS & SCIENCES" accent={C.green}
      subtitle="Every science you have researched, the books invested, the bonus each one gives and how your research is balanced."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !cats.length && <Panel><Empty title="No science capture yet" hint="Open Council → Science in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>}
      {cats.length > 0 && (
        <>
          <Grid>
            <Stat label="Total books" value={totalBooks} sub={`${fmt(booksAvailable)} books available`} color={C.green} delay={0} />
            <Stat label="Scientists" value={scientists} sub={m.nextScientist ? `Next scientist: ${m.nextScientist}` : undefined} color={C.cyan} delay={1} />
            <Stat label="Strongest bonus" value={best?.effect ?? null} format={asPct} sub={best ? `${best.name} · ${best.description}` : undefined} color={C.lime} delay={2} />
            <Stat label="Weakest" value={worst?.effect ?? null} format={asPct} sub={worst ? `${worst.name} · ${worst.description}` : undefined} color={worst && worst.effect < 0 ? C.red : C.amber} delay={3} />
          </Grid>

          <Grid>
            <Panel span={4} title="BOOKS BY CATEGORY" sub={m.capturedAt ? `Captured ${ago(m.capturedAt)}` : undefined} delay={1}>
              <Donut slices={cats.map(c => ({ label: c.name, value: c.totalBooks, color: CAT_COLOR[c.name] }))} centerBottom="Books" />
            </Panel>
            <Panel span={8} title="EFFECT OF EVERY SCIENCE" sub="Bonus (green) or penalty (red) each science currently gives" delay={2}>
              <HBars max={Math.max(10, ...all.map(a => Math.abs(a.effect)))} items={[...all].sort((a, b) => b.effect - a.effect).map(a => ({
                label: a.name, value: Math.abs(a.effect), color: a.effect >= 0 ? C.green : C.red, text: signed(a.effect),
              }))} />
            </Panel>
          </Grid>

          <Grid>
            {cats.map((c, i) => (
              <Panel key={c.name} span={4} delay={i + 2}
                title={c.name.toUpperCase()} sub={`${c.scientists} scientists · ${fmt(c.booksAvailable)} books available`}
                right={m.nextScientist && String(m.nextScientist).toLowerCase().startsWith(c.name.split(' ')[0].toLowerCase()) ? <Tag color={C.lime}>NEXT SCIENTIST</Tag> : undefined}>
                <HBars items={c.items.map((it: any) => ({ label: it.name, value: it.books, color: CAT_COLOR[c.name], text: `${compact(it.books)} · ${signed(it.effect)}` }))} />
                <div style={{ marginTop: 10, display: 'grid', gap: 5, fontSize: 11, color: '#8597a8' }}>
                  {c.items.map((it: any) => <div key={it.name}><b style={{ color: it.effect >= 0 ? C.green : C.red }}>{it.name}</b> · {it.description}</div>)}
                </div>
              </Panel>
            ))}
          </Grid>

          <Grid>
            <Panel span={12} title="RESEARCH OVER TIME" sub="Books invested per category across your captures" delay={4}>
              <LineChart series={lineSeries} height={220} />
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="ALL SCIENCES" delay={5}>
              <DataTable<any> initialSort="books" columns={[
                { key: 'category', label: 'CATEGORY', value: r => r.category },
                { key: 'name', label: 'SCIENCE', value: r => r.name },
                { key: 'books', label: 'BOOKS', value: r => r.books, render: r => fmt(r.books), align: 'right' },
                { key: 'effect', label: 'EFFECT', value: r => r.effect, render: r => <span style={{ color: r.effect >= 0 ? C.green : C.red }}>{signed(r.effect)}</span>, align: 'right' },
                { key: 'description', label: 'WHAT IT DOES', value: r => r.description },
              ]} rows={all} />
            </Panel>
          </Grid>
        </>
      )}
      {data && <AllData fields={data.fields} captures={data.captures} />}
    </Shell>
  )
}
