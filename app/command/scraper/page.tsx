'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Pairing = { code: string; expiresAt: string; provinceName: string | null; kingdomCode: string | null }

const ACTIVE = 'Scraper Generator'
const nav = [['Command', '/'], ['Province', '/command/province'], ['War Room', '/command/war-room'], ['Build Lab', '/command/build-lab'], ['Draft Calc', '/command/draft-calc'], ['Wiki', '/command/wiki'], ['Tools', '/command/tools'], ['Scraper Generator', '/command/scraper']]
const intel = [['Kingdom', '/command/kingdom'], ['Military', '/command/military'], ['Magic', '/command/magic'], ['Thievery', '/command/thievery'], ['Science', '/command/science'], ['Buildings', '/command/buildings'], ['Throne', '/command/throne'], ['Enemy Intel', '/command/enemy-intel']]

const side: React.CSSProperties = { width: 245, flexShrink: 0, minHeight: '100vh', background: '#071018', borderRight: '1px solid rgba(255,255,255,.08)', padding: 24, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }
const btn: React.CSSProperties = { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#dce7ee', borderRadius: 8, padding: '10px 12px', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'left', marginBottom: 4 }

function Sidebar() {
  const router = useRouter()
  return (
    <aside style={side}>
      <b style={{ letterSpacing: '.18em', color: '#d8ff54' }}>SPARTAN</b>
      <div style={{ fontSize: 9, color: '#718091', letterSpacing: '.16em', marginTop: 5 }}>UTOPIA COMMAND</div>
      <div style={{ margin: '30px 0 10px', fontSize: 9, color: '#5f6c7a' }}>COMMAND SYSTEMS</div>
      {nav.map(([label, href]) => (
        <button key={label} onClick={() => router.push(href)} style={{ ...btn, background: label === ACTIVE ? 'rgba(216,255,84,.08)' : 'transparent', color: label === ACTIVE ? '#d8ff54' : '#aeb9c5' }}>{label}</button>
      ))}
      <div style={{ margin: '22px 0 10px', fontSize: 9, color: '#5f6c7a' }}>INTEL DATA</div>
      {intel.map(([label, href]) => (
        <button key={label} onClick={() => router.push(href)} style={btn}>{label}</button>
      ))}
    </aside>
  )
}

export default function ScraperGeneratorPage() {
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function generate() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/scraper-pairing', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
      setPairing(body)
    } catch (err) {
      setPairing(null)
      setError(err instanceof Error ? err.message : 'Could not create a pairing code')
    } finally {
      setBusy(false)
    }
  }

  const remaining = pairing ? Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0
  const expired = Boolean(pairing) && remaining === 0

  return (
    <main style={{ minHeight: '100vh', background: '#05080d', color: '#e7eef5', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex' }}>
      <Sidebar />
      <section style={{ flex: 1, padding: '28px 34px', maxWidth: 720 }}>
        <div style={{ fontSize: 9, color: '#67f0b0', letterSpacing: '.18em' }}>SCRAPER GENERATOR</div>
        <h1 style={{ fontSize: 24, margin: '8px 0' }}>Pair your scraper</h1>
        <p style={{ color: '#8b949e', lineHeight: 1.5 }}>
          Generate a one-time code, then paste it into the Spartan Capture panel on Utopia. Each code works once and expires in 10 minutes. You only pair once per browser.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          style={{ marginTop: 16, padding: '10px 16px', border: 0, borderRadius: 8, background: '#238636', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          {busy ? 'Generating…' : pairing && !expired ? 'Generate a new code' : 'Generate pairing code'}
        </button>
        {error && <p style={{ color: '#ff7b72', marginTop: 12 }}>{error}</p>}
        {pairing && (
          <section style={{ marginTop: 20, padding: 16, border: '1px solid #30363d', borderRadius: 10, background: '#0d1117' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 28, letterSpacing: 2, color: expired ? '#6e7681' : '#7ee787', userSelect: 'all' }}>{pairing.code}</div>
            <div style={{ marginTop: 8, color: expired ? '#ff7b72' : '#8b949e', fontSize: 13 }}>
              {expired ? 'Expired. Generate a new code.' : `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
            </div>
            {pairing.provinceName && (
              <div style={{ marginTop: 8, color: '#8b949e', fontSize: 13 }}>
                Pairs to: {pairing.provinceName} {pairing.kingdomCode ? `(${pairing.kingdomCode})` : ''}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  )
}
