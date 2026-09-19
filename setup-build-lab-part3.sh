#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash setup-build-lab-part3.sh
# Adds columns to snapshot race/personality bonuses onto each build at save time
# (matches how the old Nexus system worked), plus a "Resync to Latest Rules"
# button on the build detail page for when a new age's final changes drop.
set -e

mkdir -p supabase/migrations 'app/api/builds/[id]/resync'

echo "→ supabase/migrations/20260920000000_add_build_rule_snapshots.sql"
cat > supabase/migrations/20260920000000_add_build_rule_snapshots.sql << 'EOF'
alter table spartan_builds
  add column if not exists race_rule_snapshot jsonb,
  add column if not exists personality_rule_snapshot jsonb,
  add column if not exists rules_age_number int;
EOF

echo "→ app/api/builds/route.ts (overwrite — snapshots rules on create)"
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

async function lookupRuleSnapshots(db: any, race: string | null, personality: string | null) {
  const [raceRes, personalityRes] = await Promise.all([
    race
      ? db.from('spartan_race_rules').select('*').ilike('race', race).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    personality
      ? db.from('spartan_personality_rules').select('*').ilike('personality', personality).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const ages = [raceRes.data?.age_number, personalityRes.data?.age_number].filter((n) => typeof n === 'number')
  return {
    race_rule_snapshot: raceRes.data || null,
    personality_rule_snapshot: personalityRes.data || null,
    rules_age_number: ages.length ? Math.max(...ages) : null,
  }
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

  const snapshots = await lookupRuleSnapshots(auth.db, race || null, personality || null)

  const { data, error } = await auth.db
    .from('spartan_builds')
    .insert({
      name, race: race || null, personality: personality || null, author: author || null,
      created_by_discord_id: auth.discordId,
      buildings: buildings || {}, science: science || {}, military_requirement: military_requirement || {},
      raw_build_text: raw_build_text || null, raw_military_text: raw_military_text || null,
      raw_science_text: raw_science_text || null,
      ...snapshots,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data }, { status: 201 })
}
EOF

echo "→ app/api/builds/[id]/resync/route.ts"
cat > 'app/api/builds/[id]/resync/route.ts' << 'EOF'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function requireAccount() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  return { ok: true as const, db }
}

// Re-pulls the latest race/personality rules onto an existing build.
// Use this after a new age's final changes are seeded into
// spartan_race_rules / spartan_personality_rules.
export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: build, error: fetchErr } = await auth.db.from('spartan_builds').select('race,personality').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!build) return NextResponse.json({ error: 'Build not found.' }, { status: 404 })

  const [raceRes, personalityRes] = await Promise.all([
    build.race
      ? auth.db.from('spartan_race_rules').select('*').ilike('race', build.race).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    build.personality
      ? auth.db.from('spartan_personality_rules').select('*').ilike('personality', build.personality).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const ages = [raceRes.data?.age_number, personalityRes.data?.age_number].filter((n: any) => typeof n === 'number')

  const { data, error } = await auth.db
    .from('spartan_builds')
    .update({
      race_rule_snapshot: raceRes.data || null,
      personality_rule_snapshot: personalityRes.data || null,
      rules_age_number: ages.length ? Math.max(...ages) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data })
}
EOF

echo "→ patching app/command/build-lab/page.tsx to render from the snapshot + add Resync button"

python3 << 'PYEOF'
import re

path = "app/command/build-lab/page.tsx"
with open(path) as f:
    src = f.read()

# 1. BuildDetail: derive race/personality rule from the SAVED SNAPSHOT instead of
#    live-matching against the races/personalities lists (those are still used for
#    the dropdowns in NewBuildForm).
old_lookup = '''  const raceRule = useMemo(() => build?.race ? races.find((r) => r.race.toLowerCase() === build.race.toLowerCase()) : null, [build, races])
  const personalityRule = useMemo(() => build?.personality ? personalities.find((p) => p.personality.toLowerCase() === build.personality.toLowerCase()) : null, [build, personalities])'''
new_lookup = '''  const raceRule = build?.race_rule_snapshot || null
  const personalityRule = build?.personality_rule_snapshot || null
  const [resyncing, setResyncing] = useState(false)

  async function handleResync() {
    setResyncing(true)
    try {
      const res = await fetch(`/api/builds/${id}/resync`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error || "Resync failed.")
      const { build: updated } = await res.json()
      setBuild(updated)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResyncing(false)
    }
  }'''
assert old_lookup in src, "lookup block not found"
src = src.replace(old_lookup, new_lookup)

# 2. Add the Resync button next to Delete
old_header = '''      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
        <button style={btnGhost} onClick={onBack}>← Back to Library</button>
        <button style={btnDanger} disabled={deleting} onClick={handleDelete}>{deleting ? "Deleting…" : "Delete Build"}</button>
      </div>'''
new_header = '''      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
        <button style={btnGhost} onClick={onBack}>← Back to Library</button>
        <div style={{ display:"flex", gap:8 }}>
          {(build.race || build.personality) && (
            <button style={btnGhost} disabled={resyncing} onClick={handleResync}>{resyncing ? "Resyncing…" : "Resync to Latest Rules"}</button>
          )}
          <button style={btnDanger} disabled={deleting} onClick={handleDelete}>{deleting ? "Deleting…" : "Delete Build"}</button>
        </div>
      </div>'''
assert old_header in src, "header block not found"
src = src.replace(old_header, new_header)

# 3. Show which age the snapshot is pinned to
old_title_block = '''      <h2 style={{ margin:0 }}>{build.name}</h2>
      <p style={{ color:"#8993a1", fontSize:11 }}>{[build.race, build.personality].filter(Boolean).join(" / ")}{build.author ? ` · set by ${build.author}` : ""}</p>'''
new_title_block = '''      <h2 style={{ margin:0 }}>{build.name}</h2>
      <p style={{ color:"#8993a1", fontSize:11 }}>
        {[build.race, build.personality].filter(Boolean).join(" / ")}{build.author ? ` · set by ${build.author}` : ""}
        {build.rules_age_number != null && ` · rules pinned to Age ${build.rules_age_number}`}
      </p>'''
assert old_title_block in src, "title block not found"
src = src.replace(old_title_block, new_title_block)

with open(path, "w") as f:
    f.write(src)
print("patched OK")
PYEOF

echo ""
echo "Done. What changed:"
echo "  - New builds now snapshot the current race/personality rules onto the build row at save time."
echo "  - Build detail page reads from that snapshot (not a live lookup), and shows which age it's pinned to."
echo "  - 'Resync to Latest Rules' button re-pulls current spartan_race_rules/spartan_personality_rules onto an existing build."
echo "  - NOTE: builds saved before this script won't have a snapshot yet — open each and hit Resync once to backfill it."
echo ""
echo "Next: git add -A && git commit -m 'Snapshot race/personality rules onto builds + resync' "
echo "      git fetch && git merge origin/main && git push"
