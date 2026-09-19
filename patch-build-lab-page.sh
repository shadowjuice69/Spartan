#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash patch-build-lab-page.sh
# Finishes what setup-build-lab-part3.sh started (python3 isn't on Termux by default,
# so this does the same page.tsx patch with Node instead).
set -e

cat > /tmp/patch-build-lab.js << 'EOF'
const fs = require('fs');
const path = 'app/command/build-lab/page.tsx';
let src = fs.readFileSync(path, 'utf8');

const oldLookup = `  const raceRule = useMemo(() => build?.race ? races.find((r) => r.race.toLowerCase() === build.race.toLowerCase()) : null, [build, races])
  const personalityRule = useMemo(() => build?.personality ? personalities.find((p) => p.personality.toLowerCase() === build.personality.toLowerCase()) : null, [build, personalities])`;
const newLookup = `  const raceRule = build?.race_rule_snapshot || null
  const personalityRule = build?.personality_rule_snapshot || null
  const [resyncing, setResyncing] = useState(false)

  async function handleResync() {
    setResyncing(true)
    try {
      const res = await fetch(\`/api/builds/\${id}/resync\`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error || "Resync failed.")
      const { build: updated } = await res.json()
      setBuild(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setResyncing(false)
    }
  }`;
if (!src.includes(oldLookup)) { console.error('LOOKUP BLOCK NOT FOUND — aborting, no changes made.'); process.exit(1); }
src = src.replace(oldLookup, newLookup);

const oldHeader = `      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
        <button style={btnGhost} onClick={onBack}>← Back to Library</button>
        <button style={btnDanger} disabled={deleting} onClick={handleDelete}>{deleting ? "Deleting…" : "Delete Build"}</button>
      </div>`;
const newHeader = `      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
        <button style={btnGhost} onClick={onBack}>← Back to Library</button>
        <div style={{ display:"flex", gap:8 }}>
          {(build.race || build.personality) && (
            <button style={btnGhost} disabled={resyncing} onClick={handleResync}>{resyncing ? "Resyncing…" : "Resync to Latest Rules"}</button>
          )}
          <button style={btnDanger} disabled={deleting} onClick={handleDelete}>{deleting ? "Deleting…" : "Delete Build"}</button>
        </div>
      </div>`;
if (!src.includes(oldHeader)) { console.error('HEADER BLOCK NOT FOUND — aborting, no changes made.'); process.exit(1); }
src = src.replace(oldHeader, newHeader);

const oldTitle = `      <h2 style={{ margin:0 }}>{build.name}</h2>
      <p style={{ color:"#8993a1", fontSize:11 }}>{[build.race, build.personality].filter(Boolean).join(" / ")}{build.author ? \` · set by \${build.author}\` : ""}</p>`;
const newTitle = `      <h2 style={{ margin:0 }}>{build.name}</h2>
      <p style={{ color:"#8993a1", fontSize:11 }}>
        {[build.race, build.personality].filter(Boolean).join(" / ")}{build.author ? \` · set by \${build.author}\` : ""}
        {build.rules_age_number != null && \` · rules pinned to Age \${build.rules_age_number}\`}
      </p>`;
if (!src.includes(oldTitle)) { console.error('TITLE BLOCK NOT FOUND — aborting, no changes made.'); process.exit(1); }
src = src.replace(oldTitle, newTitle);

fs.writeFileSync(path, src);
console.log('patched OK');
EOF

node /tmp/patch-build-lab.js

echo ""
echo "Done. Next: git add -A && git commit -m 'Snapshot race/personality rules onto builds + resync' "
echo "      git fetch && git merge origin/main && git push"
