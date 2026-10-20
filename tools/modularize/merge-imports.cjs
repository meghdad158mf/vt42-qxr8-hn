// چند خط import از یک ماژول در یک فایل → یک خط (بعد از fiximports)
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const SRC = path.resolve(__dirname, '../../design/src');
for (const f of execSync(`find ${SRC} -name '*.js'`).toString().trim().split('\n')) {
  const lines = fs.readFileSync(f, 'utf8').split('\n'); const first = {}; let changed = false;
  lines.forEach((l, i) => {
    const m = l.match(/^import \{ (.*) \} from '(.*)';$/); if (!m) return;
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
    if (first[m[2]] === undefined) { first[m[2]] = { i, names }; return; }
    const tgt = first[m[2]]; names.forEach(n => { if (!tgt.names.includes(n)) tgt.names.push(n); });
    lines[i] = null; changed = true;
  });
  if (!changed) continue;
  for (const [mod, { i, names }] of Object.entries(first)) lines[i] = `import { ${names.join(', ')} } from '${mod}';`;
  fs.writeFileSync(f, lines.filter(l => l !== null).join('\n'));
  console.log('merged imports in', path.relative(SRC, f));
}
