// جابه‌جایی تعریف‌ها و دستورهای سطح بالای app.js به ماژول‌های تازه (متن عیناً، با export)
const espree = require(require('path').resolve(__dirname, '../../node_modules/espree'));
const fs = require('fs');
const APP = require('path').resolve(__dirname, '../../design/src/app.js');
const spec = require(require('path').resolve(process.argv[2]));
const src = fs.readFileSync(APP, 'utf8');
const lines = src.split('\n');               // 0-based
const ast = espree.parse(src, { ecmaVersion: 2024, sourceType: 'module', loc: true });
const byName = new Map(), byLine = new Map();
for (const n of ast.body) {
  byLine.set(n.loc.start.line, n);
  const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
  if (!d) continue;
  if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') byName.set(d.id.name, n);
  else if (d.type === 'VariableDeclaration') d.declarations.forEach(x => byName.set(x.id.name, n));
}
function span(n) {           // 1-based [from, to] شامل کامنت‌های چسبیده‌ی بالا
  let from = n.loc.start.line;
  while (from > 1 && /^\s*\/\//.test(lines[from - 2])) from--;
  return [from, n.loc.end.line];
}
const removed = new Set(), replaceAt = new Map();
const ded = (s) => s;   // app.js بدون تورفتگی سطح بالاست
for (const [file, m] of Object.entries(spec)) {
  const parts = [];
  const seen = new Set();
  for (const name of m.decls || []) {
    const n = byName.get(name); if (!n) throw new Error('not found ' + name);
    if (seen.has(n)) continue; seen.add(n);
    const [a, b] = span(n);
    for (let i = a; i <= b; i++) { if (removed.has(i)) throw new Error('twice ' + name); removed.add(i); }
    let t = lines.slice(a - 1, b).join('\n');
    if (!(m.private || []).includes(name)) t = t.replace(/^(async function |function |const |let |var )/m, 'export $1');
    parts.push(t);
  }
  if (m.stmts && m.stmts.length) {
    const body = [];
    m.stmts.forEach((ln, k) => {
      const n = byLine.get(ln); if (!n) throw new Error('no stmt at ' + ln + ' for ' + file);
      const [a, b] = span(n);
      for (let i = a; i <= b; i++) removed.add(i);
      if (k === 0) replaceAt.set(a, m.call || `${m.setup}();`);
      body.push(lines.slice(a - 1, b).map(l => l ? '  ' + l : l).join('\n'));
    });
    parts.push(`${m.setupDoc ? m.setupDoc + '\n' : ''}export function ${m.setup}(${m.setupArgs || ''}){\n${body.join('\n')}\n}`);
  }
  const out = [m.header.trim(), m.imports ? m.imports.trim() : '', '', parts.join('\n'), m.extra ? '\n' + m.extra.trim() : ''].filter((x, i) => i !== 1 || x).join('\n') + '\n';
  fs.writeFileSync(require('path').resolve(__dirname, '../../design/src', file), out);
}
const outApp = [];
lines.forEach((l, i) => {
  const ln = i + 1;
  if (replaceAt.has(ln)) outApp.push(replaceAt.get(ln));
  if (removed.has(ln)) return;
  // خط خالی تکراری فقط درست بعد از یه بلوک برداشته‌شده حذف می‌شه (نه داخل رشته‌های چندخطی)
  if (l.trim() === '' && removed.has(ln - 1) && outApp.length && outApp[outApp.length - 1].trim() === '') return;
  outApp.push(l);
});
fs.writeFileSync(APP, outApp.join('\n'));
console.log('moved lines', removed.size);
