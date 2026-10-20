// برای هر نام سطح بالای app.js: کدام نام‌های سطح بالای دیگر را به کار می‌برد
const espree = require(require('path').resolve(__dirname, '../../node_modules/espree'));
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '../../design/src/app.js'), 'utf8');
const ast = espree.parse(src, { ecmaVersion: 2024, sourceType: 'module', range: true, loc: true });
const top = new Map();   // name -> node
const stmts = [];
for (const n of ast.body) {
  let names = [];
  if (n.type === 'FunctionDeclaration') names = [n.id.name];
  else if (n.type === 'VariableDeclaration') names = n.declarations.map(d => d.id.name);
  else if (n.type === 'ClassDeclaration') names = [n.id.name];
  names.forEach(x => top.set(x, n));
  stmts.push({ n, names });
}
function idents(node, out = new Set()) {
  (function walk(x, parent, key) {
    if (!x || typeof x.type !== 'string') return;
    if (x.type === 'Identifier') {
      if (parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
      if (parent && parent.type === 'Property' && key === 'key' && !parent.computed) return;
      out.add(x.name); return;
    }
    for (const k of Object.keys(x)) {
      if (k === 'parent') continue;
      const v = x[k];
      if (Array.isArray(v)) v.forEach(c => walk(c, x, k)); else if (v && typeof v.type === 'string') walk(v, x, k);
    }
  })(node);
  return out;
}
const want = process.argv.slice(2);
const set = new Set(want);
for (const name of want) {
  const n = top.get(name); if (!n) { console.log(name, 'NOT FOUND'); continue; }
  const deps = [...idents(n)].filter(x => top.has(x) && !set.has(x) && x !== name);
  console.log(`${name} [${n.loc.start.line}-${n.loc.end.line}]: ${deps.join(', ')}`);
}
// who uses each name (outside set)
if (process.env.USERS) for (const name of want) {
  const users = stmts.filter(s => !s.names.some(x => set.has(x)) && idents(s.n).has(name)).map(s => s.names[0] || ('stmt@' + s.n.loc.start.line));
  console.log('USED-BY', name, users.length, users.slice(0, 12).join(','));
}
