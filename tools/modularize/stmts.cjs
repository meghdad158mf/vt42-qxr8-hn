// دستورهای سطح بالای app.js (غیر از تعریف) که به نام‌های داده‌شده اشاره می‌کنن
const espree = require(require('path').resolve(__dirname, '../../node_modules/espree'));
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '../../design/src/app.js'), 'utf8');
const ast = espree.parse(src, { ecmaVersion: 2024, sourceType: 'module', loc: true, range: true });
const want = new Set(process.argv.slice(2));
function ids(node, out = new Set()) { (function w(x, p, k) { if (!x || typeof x.type !== 'string') return; if (x.type === 'Identifier') { if (p && p.type === 'MemberExpression' && k === 'property' && !p.computed) return; if (p && p.type === 'Property' && k === 'key' && !p.computed) return; out.add(x.name); return; } for (const kk of Object.keys(x)) { const v = x[kk]; if (Array.isArray(v)) v.forEach(c => w(c, x, kk)); else if (v && typeof v.type === 'string') w(v, x, kk); } })(node); return out; }
for (const n of ast.body) {
  if (['FunctionDeclaration', 'VariableDeclaration', 'ImportDeclaration', 'ClassDeclaration'].includes(n.type)) continue;
  const hit = [...ids(n)].filter(x => want.has(x));
  if (hit.length) console.log(n.loc.start.line + '-' + n.loc.end.line, '|', src.slice(n.range[0], n.range[0] + 90).replace(/\n/g, ' '), '|', hit.join(','));
}
