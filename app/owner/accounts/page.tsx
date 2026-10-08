'use client'

import { useEffect, useMemo, useState } from 'react'
import { C, DataTable, Empty, Grid, Panel, Shell, Skeletons, Stat, Tag, ago, fmt } from '@/components/spartan/ui'

type Account = {
  id: string; authUserId: string; discordUserId: string | null; screenName: string | null; email: string | null
  provinceName: string | null; kingdom: string | null; registrationIp: string | null; lastLoginIp: string | null
  accountStatus: string | null; role: string | null; createdAt: string; updatedAt: string; lastLoginAt: string | null
  previousLoginAt: string | null; sessionCount: number; successfulSessionCount: number
  lastSeenAt: string | null; lastBrowser: string | null; browsers: string[]
}

function browser(ua: string | null) {
  if (!ua) return '—'
  if (/CriOS/i.test(ua)) return 'Chrome iOS'
  if (/FxiOS/i.test(ua)) return 'Firefox iOS'
  if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) return 'Safari'
  if (/Edg/i.test(ua)) return 'Edge'
  if (/Chrome/i.test(ua)) return 'Chrome'
  if (/Firefox/i.test(ua)) return 'Firefox'
  if (/Android/i.test(ua)) return 'Android browser'
  return 'Other'
}

export default function OwnerAccountsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/owner/accounts', { cache: 'no-store' })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Owner account query failed.')
      setData(body)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const rows: Account[] = data?.rows || []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => [r.screenName, r.email, r.provinceName, r.kingdom, r.discordUserId, r.role, r.accountStatus].some(v => String(v || '').toLowerCase().includes(q)))
  }, [rows, query])

  return (
    <Shell title="Owner Console" eyebrow="SPARTAN // OWNER ONLY" accent={C.lime}
      subtitle="Private account intelligence. Every Spartan website account, its linked identity, account state and security/login footprint. This page is restricted to the Spartan owner."
      data={undefined} error={error} loading={loading} reload={load}
      right={<Tag color={C.lime}>OWNER LOCKED</Tag>}>
      {loading && !data && <Skeletons count={6} />}
      {data && (
        <>
          <Grid>
            <Stat label="SITE ACCOUNTS" value={data.total} sub="Every account record" color={C.lime} delay={0} />
            <Stat label="ACTIVE" value={data.active} sub="Currently active" color={C.green} delay={1} />
            <Stat label="DISABLED / OTHER" value={data.total - data.active} sub="Not active" color={C.red} delay={2} />
            <Stat label="SECURITY SESSIONS" value={rows.reduce((n, r) => n + r.sessionCount, 0)} sub="Captured login/dashboard sessions" color={C.cyan} delay={3} />
          </Grid>

          <Grid>
            <Panel span={12} title="SPARTAN MEMBERS" sub={filtered.length + ' shown · searchable account registry'} delay={1}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, province, kingdom, Discord ID…" style={{ flex: 1, minWidth: 220, background: '#0a1118', border: '1px solid #263746', borderRadius: 9, padding: '9px 11px', color: C.text, fontSize: 12 }} />
                <button onClick={load} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: C.text, borderRadius: 9, padding: '8px 12px', cursor: 'pointer' }}>Refresh</button>
              </div>
              {filtered.length ? (
                <DataTable<Account> initialSort="created" maxHeight={560} columns={[
                  { key: 'screen', label: 'ACCOUNT', value: r => r.screenName || '', render: r => <div><b>{r.screenName || '—'}</b><div style={{ color: '#687686', fontSize: 10 }}>{r.email || 'No email'}</div></div> },
                  { key: 'province', label: 'PROVINCE', value: r => r.provinceName || '', render: r => <div>{r.provinceName || '—'}<div style={{ color: '#687686', fontSize: 10 }}>{r.kingdom || '—'}</div></div> },
                  { key: 'discord', label: 'DISCORD', value: r => r.discordUserId || '', render: r => r.discordUserId || '—' },
                  { key: 'status', label: 'STATUS', value: r => r.accountStatus || '', render: r => <Tag color={r.accountStatus === 'active' ? C.green : C.red}>{String(r.accountStatus || 'unknown').toUpperCase()}</Tag> },
                  { key: 'role', label: 'ROLE', value: r => r.role || '', render: r => <Tag color={r.role === 'owner' ? C.lime : C.cyan}>{String(r.role || 'member').toUpperCase()}</Tag> },
                  { key: 'created', label: 'CREATED', value: r => Date.parse(r.createdAt) || 0, render: r => ago(r.createdAt) },
                  { key: 'login', label: 'LAST LOGIN', value: r => Date.parse(r.lastLoginAt || '') || 0, render: r => r.lastLoginAt ? ago(r.lastLoginAt) : 'Never' },
                  { key: 'ip', label: 'LAST IP', value: r => r.lastLoginIp || '', render: r => r.lastLoginIp || '—' },
                  { key: 'browser', label: 'BROWSER', value: r => r.lastBrowser || '', render: r => browser(r.lastBrowser) },
                  { key: 'sessions', label: 'SESSIONS', value: r => r.sessionCount, render: r => fmt(r.sessionCount), align: 'right' },
                ]} rows={filtered} />
              ) : <Empty title="No matching accounts" hint="Try a different search." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={7} title="ACCOUNT DETAILS" sub="Select a row above to inspect full registration and login metadata" delay={2}>
              {filtered.length ? (
                <Details rows={filtered} />
              ) : <Empty title="Nothing selected" hint="" />}
            </Panel>
            <Panel span={5} title="SECURITY SNAPSHOT" sub="What Spartan has observed from the account" delay={3}>
              {filtered.length ? <SecuritySummary rows={filtered} /> : <Empty title="Nothing selected" hint="" />}
            </Panel>
          </Grid>
        </>
      )}
    </Shell>
  )
}

function Details({ rows }: { rows: Account[] }) {
  const [pick, setPick] = useState(rows[0]?.id || '')
  const r = rows.find(x => x.id === pick) || rows[0]
  useEffect(() => { if (!rows.some(x => x.id === pick)) setPick(rows[0]?.id || '') }, [rows, pick])
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <select value={r?.id || ''} onChange={e => setPick(e.target.value)} style={{ background: '#0a1118', border: '1px solid #263746', borderRadius: 9, padding: '9px 11px', color: C.text, fontSize: 12 }}>
        {rows.map(x => <option key={x.id} value={x.id}>{x.screenName || x.provinceName || x.id}</option>)}
      </select>
      {r && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
        {[
          ['Account ID', r.id], ['Auth user ID', r.authUserId], ['Email', r.email], ['Discord ID', r.discordUserId],
          ['Province', r.provinceName], ['Kingdom', r.kingdom], ['Registration IP', r.registrationIp], ['Last login IP', r.lastLoginIp],
          ['Status', r.accountStatus], ['Role', r.role], ['Created', r.createdAt], ['Updated', r.updatedAt],
          ['Last login', r.lastLoginAt], ['Previous login', r.previousLoginAt], ['Last seen', r.lastSeenAt], ['Last browser', browser(r.lastBrowser)],
        ].map(([k, v]) => <div key={k} style={{ padding: '9px 10px', borderRadius: 9, background: 'rgba(255,255,255,.035)', fontSize: 11, overflowWrap: 'anywhere' }}><span style={{ display: 'block', color: '#687686', fontSize: 9, letterSpacing: '.12em', marginBottom: 4 }}>{k.toUpperCase()}</span>{String(v ?? '—')}</div>)}
      </div>}
    </div>
  )
}

function SecuritySummary({ rows }: { rows: Account[] }) {
  const [pick, setPick] = useState(rows[0]?.id || '')
  const r = rows.find(x => x.id === pick) || rows[0]
  useEffect(() => { if (!rows.some(x => x.id === pick)) setPick(rows[0]?.id || '') }, [rows, pick])
  return r ? (
    <div style={{ display: 'grid', gap: 12 }}>
      <select value={r.id} onChange={e => setPick(e.target.value)} style={{ background: '#0a1118', border: '1px solid #263746', borderRadius: 9, padding: '9px 11px', color: C.text, fontSize: 12 }}>
        {rows.map(x => <option key={x.id} value={x.id}>{x.screenName || x.provinceName || x.id}</option>)}
      </select>
      <div style={{ display: 'grid', gap: 8 }}>
        <Stat label="SESSION COUNT" value={r.sessionCount} sub={r.successfulSessionCount + ' successful'} color={C.cyan} delay={0} />
        <div style={{ fontSize: 12, color: '#8597a8', lineHeight: 1.7 }}>
          <div><b style={{ color: C.text }}>Registration IP:</b> {r.registrationIp || '—'}</div>
          <div><b style={{ color: C.text }}>Last login IP:</b> {r.lastLoginIp || '—'}</div>
          <div><b style={{ color: C.text }}>Last browser:</b> {browser(r.lastBrowser)}</div>
          <div><b style={{ color: C.text }}>Last seen:</b> {r.lastSeenAt ? ago(r.lastSeenAt) : 'never'}</div>
          <div style={{ marginTop: 8, color: '#687686', fontSize: 10 }}>Observed browser signatures: {r.browsers.length ? r.browsers.map(browser).join(', ') : 'none'}</div>
        </div>
      </div>
    </div>
  ) : null
}
