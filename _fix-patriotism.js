const fs = require('fs');
const path = 'app/command/draft-calc/page.tsx';
let src = fs.readFileSync(path, 'utf8');
const oldLine = `const [patriotismActive, setPatriotismActive] = useState(false)`;
const newLine = `const [patriotismActive, setPatriotismActive] = useState(true) // in-game calculator assumes Patriotism stays active`;
if (!src.includes(oldLine)) { console.error('LINE NOT FOUND — aborting.'); process.exit(1); }
fs.writeFileSync(path, src.replace(oldLine, newLine));
console.log('patched OK');
