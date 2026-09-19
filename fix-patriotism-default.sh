#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash fix-patriotism-default.sh
# The in-game Draft Calculator always assumes Patriotism is active in its projections
# (confirmed: this closes the calibration gap against a real sample almost exactly).
# Defaulting the checkbox to on so the tool matches that convention out of the box.
set -e
cat > ./_fix-patriotism.js << 'EOF'
const fs = require('fs');
const path = 'app/command/draft-calc/page.tsx';
let src = fs.readFileSync(path, 'utf8');
const oldLine = `const [patriotismActive, setPatriotismActive] = useState(false)`;
const newLine = `const [patriotismActive, setPatriotismActive] = useState(true) // in-game calculator assumes Patriotism stays active`;
if (!src.includes(oldLine)) { console.error('LINE NOT FOUND — aborting.'); process.exit(1); }
fs.writeFileSync(path, src.replace(oldLine, newLine));
console.log('patched OK');
EOF
node ./_fix-patriotism.js
rm ./_fix-patriotism.js
echo ""
echo "Next: git add -A && git commit -m 'Draft Calc: default Patriotism to active, matching in-game convention' "
echo "      git fetch && git merge origin/main && git push"
