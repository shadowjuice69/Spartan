#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash fix-province-id-sync.sh
#
# Root cause: the capture pipeline writes province_id = account UUID on every
# capture, but spartan_province_registry rows are keyed by province_id = the
# province's NAME (e.g. "Sorry About Your Acres"), seeded by the roster
# scraper. The registry-sync step in app/api/capture/identity/route.ts only
# refreshed user_id/kingdom_code/timestamps and never reconciled province_id
# itself — so every new registrant's registry row permanently disagrees with
# what their own captures use, until someone notices missing data and
# hand-patches the DB (as done for Shadow's and Riven's accounts).
#
# This patch makes that route also set province_id = the account's UUID on
# every sync, so it self-corrects the first time a user's capture device is
# provisioned or refreshed — no more manual fixes needed per user.
set -e

cat > ./_fix-province-id-sync.js << 'EOF'
const fs = require('fs');
const path = 'app/api/capture/identity/route.ts';
let src = fs.readFileSync(path, 'utf8');

const oldLine = `await supabase.from('spartan_province_registry').update({ user_id: account.auth_user_id, kingdom_code: resolvedKingdomCode, last_seen_at: now, updated_at: now }).eq('province_name', resolvedProvinceName).eq('kingdom_code', resolvedKingdomCode)`;
const newLine = `await supabase.from('spartan_province_registry').update({ province_id: ownerId, user_id: account.auth_user_id, kingdom_code: resolvedKingdomCode, last_seen_at: now, updated_at: now }).eq('province_name', resolvedProvinceName).eq('kingdom_code', resolvedKingdomCode)`;

if (!src.includes(oldLine)) {
  console.error('EXPECTED LINE NOT FOUND — aborting, no changes made. The file may have changed since this patch was written; paste it back and I will redo the patch.');
  process.exit(1);
}
src = src.replace(oldLine, newLine);
fs.writeFileSync(path, src);
console.log('patched OK — province_id now reconciled to the account UUID on every device sync.');
EOF

node ./_fix-province-id-sync.js
rm ./_fix-province-id-sync.js

echo ""
echo "Done. Next: git add -A && git commit -m 'Reconcile province_id to account UUID on device sync' "
echo "      git fetch && git merge origin/main && git push"
