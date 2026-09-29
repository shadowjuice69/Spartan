'use client'

import { useEffect, useState } from 'react'

type Pairing = { code: string; expiresAt: string; provinceName: string | null; kingdomCode: string | null }

export default function ScraperPairingPage() {
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
    <main style={{ maxWidth: 520, margin: '40px auto', padding: 16, color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Pair your scraper</h1>
      <p style={{ color: '#8b949e', lineHeight: 1.5 }}>
        Generate a one-time code, then paste it into the Spartan Capture panel on Utopia. Each code works once and expires in 10 minutes.
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
          <div style={{ fontFamily: 'monospace', fontSize: 28, letterSpacing: 2, color: expired ? '#6e7681' : '#7ee787', userSelect: 'all' }}>
            {pairing.code}
          </div>
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
    </main>
  )
}
