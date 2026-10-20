// برای هر فایل design/src: نام‌های تعریف‌نشده (ESLint no-undef) رو از ماژولی که export می‌کنه import می‌کنه.
// تابع‌های سطح بالای app.js (که هنوز export نشدن) هم export و import می‌شن — «ارجاع موقت به app.js».
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const espree = require(require('path').resolve(__dirname, '../../node_modules/espree'));
const SRC = require('path').resolve(__dirname, '../../design/src');
const files = execSync(`find ${SRC} -name '*.js'`).toString().trim().split('\n');
const exportsOf = {};   // name -> file
const appFns = new Set(), appOther = new Set();
for (const f of files) {
  const ast = espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2024, sourceType: 'module' });
  for (const n of ast.body) {
    if (n.type === 'ExportNamedDeclaration' && n.declaration) {
      const d = n.declaration;
      const names = d.type === 'VariableDeclaration' ? d.declarations.map(x => x.id.name) : [d.id.name];
      names.forEach(x => { if (exportsOf[x] && exportsOf[x] !== f) console.error('DUP export', x, f, exportsOf[x]); exportsOf[x] = f; });
    }
    if (f.endsWith('/app.js')) {
      if (n.type === 'FunctionDeclaration') appFns.add(n.id.name);
      else if (n.type === 'VariableDeclaration') n.declarations.forEach(x => appOther.add(x.id.name));
    }
  }
}
const lint = JSON.parse(execSync('npx eslint design/src -f json || true', { cwd: require('path').resolve(__dirname, '../..'), maxBuffer: 1 << 26 }).toString());
const toExportInApp = new Set(), problems = [];
for (const r of lint) {
  const undef = [...new Set(r.messages.filter(m => m.ruleId === 'no-undef').map(m => m.message.match(/'(.+?)'/)[1]))];
  if (!undef.length) continue;
  const byMod = {};
  for (const name of undef) {
    let from = exportsOf[name];
    if (!from && appFns.has(name) && !r.filePath.endsWith('/app.js')) { from = SRC + '/app.js'; toExportInApp.add(name); }
    if (!from) { problems.push(path.relative(SRC, r.filePath) + ': ' + name + (appOther.has(name) ? ' (let/const در app.js)' : '')); continue; }
    if (from === r.filePath) continue;
    (byMod[from] ||= []).push(name);
  }
  const lines = Object.entries(byMod).map(([mod, ns]) => {
    let rel = path.relative(path.dirname(r.filePath), mod).replace(/\\/g, '/'); if (!rel.startsWith('.')) rel = './' + rel;
    return `import { ${ns.sort().join(', ')} } from '${rel}';`;
  }).sort((a, b) => (a.includes("app.js'") ? 1 : 0) - (b.includes("app.js'") ? 1 : 0) || a.localeCompare(b));
  if (!lines.length) continue;
  const t = fs.readFileSync(r.filePath, 'utf8').split('\n');
  // بعد از آخرین import موجود، وگرنه بعد از کامنت‌های سرآغاز
  let at = -1; t.forEach((l, i) => { if (/^import /.test(l)) at = i; });
  if (at < 0) { at = 0; while (at < t.length && t[at].startsWith('//')) at++; at--; }
  const appLines = lines.filter(l => l.includes("app.js'"));
  const note = appLines.length ? ['// ⚠️ ارجاع موقت به app.js (فقط تابع — tests/unit/app-back-refs.test.js)'] : [];
  t.splice(at + 1, 0, ...lines.filter(l => !l.includes("app.js'")), ...note, ...appLines);
  fs.writeFileSync(r.filePath, t.join('\n'));
  console.log(path.relative(SRC, r.filePath), '+', lines.length, 'import line(s)');
}
// export کردن تابع‌های app.js که ماژول‌های دیگه لازم دارن
if (toExportInApp.size) {
  const p = SRC + '/app.js'; let t = fs.readFileSync(p, 'utf8');
  for (const n of toExportInApp) {
    const re = new RegExp('^(async )?function ' + n + '\\(', 'm');
    if (!re.test(t)) { problems.push('app.js: cannot export ' + n); continue; }
    t = t.replace(re, (m) => 'export ' + m);
  }
  fs.writeFileSync(p, t);
  console.log('app.js exports +', [...toExportInApp].join(', '));
}
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exitCode = 1; }
