#!/data/data/com.termux/files/usr/bin/bash
# Run this from the root of your Spartan repo in Termux:
#   bash setup-build-lab.sh
# It creates: 1 migration, 2 lib files, 2 API routes, 1 page (Build Lab).
set -e

mkdir -p supabase/migrations lib/spartan app/api/builds/'[id]' app/command/build-lab

echo "→ supabase/migrations/20260919000000_create_spartan_builds.sql"
cat > supabase/migrations/20260919000000_create_spartan_builds.sql << 'EOF'
create table if not exists spartan_builds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  race text,
  personality text,
  author text,
  created_by_discord_id text,
  active boolean not null default true,

  -- { "Farms": 7, "Homes": 0, ... }  (percentages)
  buildings jsonb not null default '{}',

  -- { economy: { Alchemy: {type:'weight',value:4}, Artisan: {type:'actual_pct',value:4.2} }, military: {...}, arcane: {...} }
  science jsonb not null default '{}',

  -- { ppa, tpa, wpa, dspa, epa_ospa, gcpa, notes }
  military_requirement jsonb not null default '{}',

  raw_build_text text,
  raw_military_text text,
  raw_science_text text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spartan_builds_active_idx on spartan_builds (active);

alter table spartan_builds enable row level security;
-- Writes go through the service-role client in the API routes (same pattern as your
-- other spartan_* tables), so this policy only needs to cover direct/anon reads.
create policy "spartan_builds_read_all" on spartan_builds for select using (true);
EOF

echo "→ lib/spartan/build-parser.ts"
cat > lib/spartan/build-parser.ts << 'EOF'
// Deterministic (non-AI) parsers for the Build Lab's three paste boxes.
// The in-game/Discord format is consistent enough that regex beats an AI
// round-trip here — instant, free, and never invents numbers.

export type ScienceEntry =
  | { type: 'weight'; value: number }
  | { type: 'actual_pct'; value: number }

export type ScienceCategory = Record<string, ScienceEntry>

export interface ParsedBuild {
  name: string | null
  author: string | null
  buildings: Record<string, number>
}

export interface ParsedMilitaryRequirement {
  ppa: number | null
  tpa: number | null
  wpa: number | null
  dspa: number | null
  epa_ospa: number | null
  gcpa: number | null
  notes: string
}

export interface ParsedScience {
  economy: ScienceCategory
  military: ScienceCategory
  arcane: ScienceCategory
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Box 1 — Build: header line + building percentages */
export function parseBuildText(raw: string): ParsedBuild {
  const text = raw || ''
  const header = text.match(/\*\*(.+?)\*\*\s*build(?:\s*(?:—|-)\s*set by\s*([^·\n]+))?/i)
  const name = header ? clean(header[1]) : null
  const author = header && header[2] ? clean(header[2]) : null

  const buildings: Record<string, number> = {}
  const lineRe = /^\s*([A-Za-z][A-Za-z ]*?)\s*(?:—|-)?\s*(\d+(?:\.\d+)?)\s*%\s*$/
  for (const line of text.split('\n')) {
    const m = line.match(lineRe)
    if (m) buildings[clean(m[1])] = Number(m[2])
  }
  return { name, author, buildings }
}

/** Box 2 — Military Requirement: per-acre ratios + freeform notes */
export function parseMilitaryRequirementText(raw: string): ParsedMilitaryRequirement {
  const text = raw || ''
  const metricRe = /^\s*([\d.]+)\s*(ppa|tpa|wpa|dspa|epa\/ospa|gcpa)\b/i
  const result: ParsedMilitaryRequirement = {
    ppa: null, tpa: null, wpa: null, dspa: null, epa_ospa: null, gcpa: null, notes: '',
  }
  const noteLines: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || /^military$/i.test(line)) continue
    const m = line.match(metricRe)
    if (m) {
      const value = Number(m[1])
      const key = m[2].toLowerCase().replace('/', '_') as keyof ParsedMilitaryRequirement
      if (key in result) (result as any)[key] = value
    } else {
      noteLines.push(line)
    }
  }
  result.notes = noteLines.join(' ')
  return result
}

/** Box 3 — Science: 3 categories, each line "Nx Name" (weight) or "N% Name (...)" (fixed target %) */
export function parseScienceText(raw: string): ParsedScience {
  const text = raw || ''
  const sections: ParsedScience = { economy: {}, military: {}, arcane: {} }
  const headerRe = /^(economy|military|arcane)(\s+science)?\s*$/i
  const lineRe = /^\s*(\d+(?:\.\d+)?)\s*(x|%)\s+([A-Za-z]+)/i

  let current: keyof ParsedScience | null = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const h = line.match(headerRe)
    if (h) { current = h[1].toLowerCase() as keyof ParsedScience; continue }
    if (!current) continue
    const m = line.match(lineRe)
    if (!m) continue
    const value = Number(m[1])
    const scienceName = clean(m[3])
    sections[current][scienceName] = m[2] === '%' ? { type: 'actual_pct', value } : { type: 'weight', value }
  }
  return sections
}
EOF

echo "→ lib/spartan/science-calculator.ts"
cat > lib/spartan/science-calculator.ts << 'EOF'
import type { ScienceCategory } from './build-parser'

export interface AllocationRow {
  name: string
  type: 'weight' | 'actual_pct'
  input: number
  books: number
}

export interface CategoryAllocation {
  category: string
  totalBooks: number
  rows: AllocationRow[]
}

/**
 * Fixed-% entries (e.g. "4.2% Artisan") are carved off the top first — they're a
 * target share of the category, not a relative weight. Remaining books split by
 * weight across everything else.
 */
export function calculateCategoryAllocation(
  category: string,
  entries: ScienceCategory,
  totalBooks: number
): CategoryAllocation {
  const names = Object.keys(entries)
  const fixed = names.filter((n) => entries[n].type === 'actual_pct')
  const weighted = names.filter((n) => entries[n].type === 'weight')

  const rows: AllocationRow[] = []
  let booksUsedByFixed = 0
  for (const name of fixed) {
    const pct = entries[name].value
    const books = Math.round(totalBooks * (pct / 100))
    booksUsedByFixed += books
    rows.push({ name, type: 'actual_pct', input: pct, books })
  }

  const remaining = Math.max(0, totalBooks - booksUsedByFixed)
  const sumWeights = weighted.reduce((s, n) => s + entries[n].value, 0)
  const perUnit = sumWeights > 0 ? remaining / sumWeights : 0
  for (const name of weighted) {
    const weight = entries[name].value
    rows.push({ name, type: 'weight', input: weight, books: Math.round(weight * perUnit) })
  }
  return { category, totalBooks, rows }
}

export function calculateAllocations(
  science: { economy: ScienceCategory; military: ScienceCategory; arcane: ScienceCategory },
  booksByCategory: { economy: number; military: number; arcane: number }
): CategoryAllocation[] {
  return (['economy', 'military', 'arcane'] as const).map((cat) =>
    calculateCategoryAllocation(cat, science[cat], booksByCategory[cat] || 0)
  )
}
EOF

echo "→ app/api/builds/route.ts"
cat > app/api/builds/route.ts << 'EOF'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAccount() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  const { data: account } = await db
    .from('spartan_accounts')
    .select('discord_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return { ok: true as const, db, discordId: account?.discord_user_id ? String(account.discord_user_id) : null }
}

export async function GET(request: Request) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = new URL(request.url).searchParams.get('search') || ''
  let query = auth.db
    .from('spartan_builds')
    .select('id,name,race,personality,author,updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ builds: data })
}

export async function POST(request: Request) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, race, personality, author, buildings, science, military_requirement,
          raw_build_text, raw_military_text, raw_science_text } = body
  if (!name) return NextResponse.json({ error: 'Build name is required.' }, { status: 400 })

  const { data, error } = await auth.db
    .from('spartan_builds')
    .insert({
      name, race: race || null, personality: personality || null, author: author || null,
      created_by_discord_id: auth.discordId,
      buildings: buildings || {}, science: science || {}, military_requirement: military_requirement || {},
      raw_build_text: raw_build_text || null, raw_military_text: raw_military_text || null,
      raw_science_text: raw_science_text || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data }, { status: 201 })
}
EOF

echo "→ app/api/builds/[id]/route.ts"
cat > 'app/api/builds/[id]/route.ts' << 'EOF'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isOwner, isTrustedAdmin } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

async function requireAccount() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  const { data: account } = await db
    .from('spartan_accounts')
    .select('discord_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return { ok: true as const, db, discordId: account?.discord_user_id ? String(account.discord_user_id) : null }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await auth.db.from('spartan_builds').select('*').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Build not found.' }, { status: 404 })
  return NextResponse.json({ build: data })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await auth.db
    .from('spartan_builds')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await auth.db.from('spartan_builds').select('created_by_discord_id').eq('id', params.id).maybeSingle()
  const owns = existing?.created_by_discord_id && existing.created_by_discord_id === auth.discordId
  if (!owns && !isOwner(auth.discordId) && !isTrustedAdmin(auth.discordId)) {
    return NextResponse.json({ error: 'Only the build author or an admin can remove this build.' }, { status: 403 })
  }

  const { error } = await auth.db.from('spartan_builds').update({ active: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
EOF

echo "→ app/command/build-lab/page.tsx"
cat > app/command/build-lab/page.tsx << 'EOF'
"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { parseBuildText, parseMilitaryRequirementText, parseScienceText, ParsedBuild, ParsedMilitaryRequirement, ParsedScience } from "@/lib/spartan/build-parser"
import { calculateAllocations } from "@/lib/spartan/science-calculator"

const nav = [["Command","/"],["Kingdom","/command/kingdom"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["Wiki","/command/wiki"],["Tools","/command/tools"]]

const shell: any = { minHeight:"100vh", background:"#05080d", color:"#e7eef5", fontFamily:"Inter,system-ui,sans-serif", display:"flex" }
const sidebar: any = { width:245, flexShrink:0, minHeight:"100vh", background:"#071018", borderRight:"1px solid rgba(255,255,255,.08)", padding:24, position:"sticky", top:0, height:"100vh", overflowY:"auto" }
const card: any = { padding:16, border:"1px solid rgba(255,255,255,.08)", borderRadius:10, background:"#081119" }
const btnPrimary: any = { background:"#d8ff54", color:"#101408", border:"1px solid #91a93a", borderRadius:8, padding:"9px 14px", fontWeight:800, fontSize:11, cursor:"pointer" }
const btnGhost: any = { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.1)", color:"#dce7ee", borderRadius:8, padding:"9px 14px", fontSize:11, cursor:"pointer" }
const textarea: any = { width:"100%", height:150, background:"#05080d", border:"1px solid rgba(255,255,255,.08)", borderRadius:8, padding:10, fontSize:11, fontFamily:"monospace", color:"#dce7ee" }
const input: any = { background:"#05080d", border:"1px solid rgba(255,255,255,.08)", borderRadius:6, padding:"7px 9px", fontSize:11, color:"#dce7ee" }

function Sidebar({ active }: { active: string }) {
  const router = useRouter()
  return (
    <aside style={sidebar}>
      <div style={{ fontWeight:900, letterSpacing:".18em", color:"#d8ff54" }}>SPARTAN</div>
      <div style={{ fontSize:9, color:"#718091", letterSpacing:".16em", marginTop:5 }}>UTOPIA COMMAND</div>
      <div style={{ margin:"30px 0 10px", fontSize:9, color:"#5f6c7a", letterSpacing:".18em" }}>COMMAND SYSTEMS</div>
      {nav.map(([name, path]) => (
        <button key={name} onClick={() => router.push(path)} style={{ display:"block", width:"100%", textAlign:"left", padding:"11px 12px", marginBottom:4, border:0, borderRadius:8, background: name===active ? "rgba(216,255,84,.08)" : "transparent", color: name===active ? "#d8ff54" : "#aeb9c5", fontWeight:700, fontSize:11, cursor:"pointer" }}>
          {name}
        </button>
      ))}
    </aside>
  )
}

function NewBuildForm({ onSaved }: { onSaved: () => void }) {
  const [buildText, setBuildText] = useState("")
  const [militaryText, setMilitaryText] = useState("")
  const [scienceText, setScienceText] = useState("")
  const [parsedBuild, setParsedBuild] = useState<ParsedBuild | null>(null)
  const [parsedMilitary, setParsedMilitary] = useState<ParsedMilitaryRequirement | null>(null)
  const [parsedScience, setParsedScience] = useState<ParsedScience | null>(null)
  const [race, setRace] = useState("")
  const [personality, setPersonality] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!parsedBuild?.name) { setError("Parse Box 1 first — a build name is required."); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/builds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parsedBuild.name, author: parsedBuild.author, race: race || null, personality: personality || null,
          buildings: parsedBuild.buildings, science: parsedScience || { economy:{}, military:{}, arcane:{} },
          military_requirement: parsedMilitary || {}, raw_build_text: buildText, raw_military_text: militaryText, raw_science_text: scienceText,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Save failed.")
      onSaved()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Add a Build</h2>

      <p style={{ fontSize:10, color:"#67f0b0", letterSpacing:".1em", marginBottom:4 }}>1 — BUILD (name + buildings)</p>
      <textarea style={textarea} placeholder={"🏗 **orc cleric** build — set by Savage\n  Farms 7%\n  Guilds 13%\n  ..."} value={buildText} onChange={(e) => setBuildText(e.target.value)} />
      <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setParsedBuild(parseBuildText(buildText))}>Parse</button>
      {parsedBuild && (
        <div style={{ fontSize: 11, marginTop: 10, color: "#b7c2cc" }}>
          <p>Name: <b style={{ color:"#e7eef5" }}>{parsedBuild.name || "—"}</b> · By: {parsedBuild.author || "—"}</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:2 }}>
            {Object.entries(parsedBuild.buildings).map(([k, v]) => <span key={k}>{k}: <b style={{color:"#d8ff54"}}>{v}%</b></span>)}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <input style={input} placeholder="Race" value={race} onChange={(e) => setRace(e.target.value)} />
            <input style={input} placeholder="Personality" value={personality} onChange={(e) => setPersonality(e.target.value)} />
          </div>
        </div>
      )}

      <p style={{ fontSize:10, color:"#67f0b0", letterSpacing:".1em", margin:"18px 0 4px" }}>2 — MILITARY REQUIREMENT (ppa/tpa/wpa/dspa/epa-ospa + notes)</p>
      <textarea style={textarea} placeholder={"Military\n\n6ppa\n3tpa\n1.5 wpa\n6 dspa\n10.5 epa/ospa\n\nKeep in mind you need 350 GCPA for drake reserves."} value={militaryText} onChange={(e) => setMilitaryText(e.target.value)} />
      <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setParsedMilitary(parseMilitaryRequirementText(militaryText))}>Parse</button>
      {parsedMilitary && (
        <div style={{ fontSize: 11, marginTop: 10, color: "#b7c2cc" }}>
          <p style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
            <span>PPA: {parsedMilitary.ppa ?? "—"}</span><span>TPA: {parsedMilitary.tpa ?? "—"}</span><span>WPA: {parsedMilitary.wpa ?? "—"}</span>
            <span>DSPA: {parsedMilitary.dspa ?? "—"}</span><span>EPA/OSPA: {parsedMilitary.epa_ospa ?? "—"}</span>
            {parsedMilitary.gcpa != null && <span>GCPA: {parsedMilitary.gcpa}</span>}
          </p>
          {parsedMilitary.notes && <p style={{ fontStyle:"italic", color:"#8993a1" }}>{parsedMilitary.notes}</p>}
        </div>
      )}

      <p style={{ fontSize:10, color:"#67f0b0", letterSpacing:".1em", margin:"18px 0 4px" }}>3 — SCIENCE (Economy / Military / Arcane)</p>
      <textarea style={textarea} placeholder={"ECONOMY SCIENCE\n\n4x Alchemy\n4.2% Artisan (actual % needed)\n\nMILITARY SCIENCE\n\n5x Strategy\n...\n\nARCANE\n\n10x Crime\n..."} value={scienceText} onChange={(e) => setScienceText(e.target.value)} />
      <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setParsedScience(parseScienceText(scienceText))}>Parse</button>
      {parsedScience && (
        <div style={{ fontSize: 11, marginTop: 10, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, color: "#b7c2cc" }}>
          {(["economy","military","arcane"] as const).map((cat) => (
            <div key={cat}>
              <p style={{ color:"#687686", textTransform:"uppercase", fontSize:9 }}>{cat}</p>
              {Object.entries(parsedScience[cat]).map(([name, e]) => <p key={name}>{name}: <b style={{color:"#d8ff54"}}>{e.type === "weight" ? `${e.value}x` : `${e.value}%*`}</b></p>)}
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color:"#ff9b9b", fontSize:11, marginTop:10 }}>{error}</p>}
      <button style={{ ...btnPrimary, marginTop:16 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Build"}</button>
    </div>
  )
}

function BuildDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [build, setBuild] = useState<any>(null)
  const [error, setError] = useState("")
  const [books, setBooks] = useState({ economy: 0, military: 0, arcane: 0 })

  useEffect(() => {
    fetch(`/api/builds/${id}`).then((r) => r.json()).then((j) => j.build ? setBuild(j.build) : setError(j.error || "Not found"))
  }, [id])

  const allocations = useMemo(() => build ? calculateAllocations(build.science, books) : [], [build, books])
  if (error) return <div style={card}>{error}</div>
  if (!build) return <div style={card}>Loading…</div>
  const mil = build.military_requirement || {}

  return (
    <div style={card}>
      <button style={{ ...btnGhost, marginBottom: 16 }} onClick={onBack}>← Back to Library</button>
      <h2 style={{ margin:0 }}>{build.name}</h2>
      <p style={{ color:"#8993a1", fontSize:11 }}>{[build.race, build.personality].filter(Boolean).join(" / ")}{build.author ? ` · set by ${build.author}` : ""}</p>

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>BUILDINGS</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:2, fontSize:11 }}>
        {Object.entries(build.buildings || {}).map(([k, v]: any) => <span key={k}>{k}: <b style={{color:"#d8ff54"}}>{v}%</b></span>)}
      </div>

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>MILITARY REQUIREMENT</h3>
      <p style={{ fontSize:11, display:"flex", gap:14, flexWrap:"wrap" }}>
        <span>PPA: {mil.ppa ?? "—"}</span><span>TPA: {mil.tpa ?? "—"}</span><span>WPA: {mil.wpa ?? "—"}</span>
        <span>DSPA: {mil.dspa ?? "—"}</span><span>EPA/OSPA: {mil.epa_ospa ?? "—"}</span>
        {mil.gcpa != null && <span>GCPA: {mil.gcpa}</span>}
      </p>
      {mil.notes && <p style={{ fontSize:11, color:"#8993a1", fontStyle:"italic" }}>{mil.notes}</p>}

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>SCIENCE CALCULATOR</h3>
      <div style={{ display:"flex", gap:14, marginBottom:14 }}>
        {(["economy","military","arcane"] as const).map((cat) => (
          <label key={cat} style={{ fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ color:"#8993a1", textTransform:"capitalize" }}>{cat} books</span>
            <input type="number" min={0} style={{ ...input, width:110 }} value={books[cat] || ""} onChange={(e) => setBooks((b) => ({ ...b, [cat]: Number(e.target.value) || 0 }))} />
          </label>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {allocations.map((alloc) => (
          <div key={alloc.category}>
            <p style={{ fontSize:9, color:"#687686", textTransform:"uppercase" }}>{alloc.category}</p>
            {alloc.rows.map((row) => (
              <p key={row.name} style={{ fontSize:11, display:"flex", justifyContent:"space-between" }}>
                <span>{row.name}</span>
                <b style={{ color:"#d8ff54" }}>{row.books.toLocaleString()}{row.type === "actual_pct" && <span style={{ color:"#687686" }}> (fixed {row.input}%)</span>}</b>
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function BuildLab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const [builds, setBuilds] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState("")

  function loadBuilds() {
    fetch("/api/builds").then((r) => r.json()).then((j) => j.builds ? setBuilds(j.builds) : setError(j.error || "Failed to load builds"))
  }
  useEffect(() => { if (!id) loadBuilds() }, [id])

  return (
    <main style={shell}>
      <Sidebar active="Build Lab" />
      <section style={{ flex: 1, padding: "30px 34px", maxWidth: 1500 }}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:9, color:"#67f0b0", letterSpacing:".2em" }}>SPARTAN // BUILD LAB</div>
            <h1 style={{ fontSize:34, margin:"7px 0 0" }}>Build Library</h1>
          </div>
          {!id && <button style={btnPrimary} onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "+ Add Build"}</button>}
        </header>

        {error && <div style={{ ...card, borderColor:"rgba(255,100,100,.3)", color:"#ff9b9b", marginBottom:16 }}>{error}</div>}

        {id ? (
          <BuildDetail id={id} onBack={() => router.push("/command/build-lab")} />
        ) : (
          <>
            {showForm && <NewBuildForm onSaved={() => { setShowForm(false); loadBuilds() }} />}
            <div style={{ display:"grid", gap:10 }}>
              {builds.map((b) => (
                <button key={b.id} onClick={() => router.push(`/command/build-lab?id=${b.id}`)} style={{ ...card, textAlign:"left", cursor:"pointer" }}>
                  <p style={{ margin:0, fontWeight:700 }}>{b.name}</p>
                  <p style={{ margin:"4px 0 0", fontSize:11, color:"#8993a1" }}>
                    {[b.race, b.personality].filter(Boolean).join(" / ") || "No race/personality set"}
                    {b.author ? ` · set by ${b.author}` : ""}
                  </p>
                </button>
              ))}
              {!builds.length && !error && <p style={{ color:"#687686" }}>No builds saved yet.</p>}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main style={{ ...shell, alignItems:"center", justifyContent:"center" }}>Loading Build Lab…</main>}>
      <BuildLab />
    </Suspense>
  )
}
EOF

echo ""
echo "Done. Next steps:"
echo "  1. Run the migration against your Supabase project (utopia-war-room)."
echo "  2. git add -A && git commit -m 'Add Build Lab' "
echo "  3. git fetch && git merge origin/main   (before pushing, per your usual workflow)"
echo "  4. git push"
