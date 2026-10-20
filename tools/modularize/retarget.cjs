// نام‌هایی که از app.js import شدن ولی دیگه آنجا export نیستن (جابه‌جا شدن) → import از ماژول تازه‌شون
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const espree = require(path.resolve(__dirname, '../../node_modules/espree'));
const SRC = path.resolve(__dirname, '../../design/src');
const files = execSync(`find ${SRC} -name '*.js'`).toString().trim().split('\n');
const exportsOf = {};
for (const f of files) {
  for (const n of espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2024, sourceType: 'module' }).body) {
    if (n.type !== 'ExportNamedDeclaration' || !n.declaration) continue;
    const d = n.declaration;
    (d.type === 'VariableDeclaration' ? d.declarations.map(x => x.id.name) : [d.id.name]).forEach(x => { exportsOf[x] = f; });
  }
}
for (const f of files) {
  if (f.endsWith('/app.js')) continue;
  let lines = fs.readFileSync(f, 'utf8').split('\n'); let changed = false; const add = {};
  lines = lines.map(l => {
    const m = l.match(/^import \{ (.*) \} from '((?:\.\.?\/)+app\.js)';$/); if (!m) return l;
    const keep = [];
    for (const n of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
      const home = exportsOf[n];
      if (home && !home.endsWith('/app.js')) { (add[home] ||= []).push(n); changed = true; } else keep.push(n);
    }
    return keep.length ? `import { ${keep.join(', ')} } from '${m[2]}';` : null;
  }).filter(l => l !== null);
  if (!changed) continue;
  const at = lines.findIndex(l => l.startsWith('// ⚠️ ارجاع موقت به app.js'));
  const ins = Object.entries(add).map(([mod, ns]) => {
    let rel = path.relative(path.dirname(f), mod); if (!rel.startsWith('.')) rel = './' + rel;
    return `import { ${ns.sort().join(', ')} } from '${rel}';`;
  });
  lines.splice(at >= 0 ? at : lines.findIndex(l => l.startsWith('import ')), 0, ...ins);
  // اگه دیگه چیزی از app.js نمونده، کامنت هشدارش هم برداشته بشه
  if (!lines.some(l => /from '(\.\.?\/)+app\.js'/.test(l))) lines = lines.filter(l => !l.startsWith('// ⚠️ ارجاع موقت به app.js'));
  fs.writeFileSync(f, lines.join('\n'));
  console.log('retargeted', path.relative(SRC, f), JSON.stringify(Object.fromEntries(Object.entries(add).map(([k, v]) => [path.relative(SRC, k), v]))));
}
