#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash cleanup-repo-scripts.sh
# Removes the one-time setup/patch scripts that git add -A swept into the repo
# over the course of this session. They already did their job; the repo doesn't
# need to keep them.
set -e

FILES=(
  fix-jeeves-military-fields.sh
  fix-patriotism-default.sh
  fix-province-id-sync.sh
  patch-build-lab-page.sh
  patch-build-lab-page-v2.sh
  setup-build-lab.sh
  setup-build-lab-part2.sh
  setup-build-lab-part3.sh
  setup-draft-calc.sh
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    git rm -q "$f"
    echo "removed $f"
  else
    echo "skip (not found): $f"
  fi
done

echo ""
echo "Next: git commit -m 'Clean up one-time setup scripts' "
echo "      git fetch && git merge origin/main && git push"
