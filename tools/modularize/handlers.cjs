// نام تابع‌هایی که دستگیره‌های درون HTML (onclick=… در صفحه و در رشته‌های app.js) صدا می‌زنن
const espree = require(require('path').resolve(__dirname, '../../node_modules/espree'));
const fs=require('fs');
const src=fs.readFileSync(require('path').resolve(__dirname, '../../design/src/app.js'),'utf8');
const html=fs.readFileSync(require('path').resolve(__dirname, '../../design/ita-monitoring-prototype.html'),'utf8');
const ast=espree.parse(src,{ecmaVersion:2024,sourceType:'module'});
const top=new Map();
for(const n of ast.body){ const d=n.type==='ExportNamedDeclaration'?n.declaration:n; if(!d) continue;
  if(d.type==='FunctionDeclaration') top.set(d.id.name,'function');
  else if(d.type==='VariableDeclaration') d.declarations.forEach(x=>top.set(x.id.name,d.kind)); }
const pat=/\bon[a-z]+\s*=\s*(\\?)(["'])/g; const used=new Map();
for(const text of [html, src]){ let m; while((m=pat.exec(text))){ const q=m[2]; const i=m.index+m[0].length; const body=text.slice(i, text.indexOf(q,i));
  for(const id of body.match(/[A-Za-z_$][\w$]*/g)||[]) if(top.has(id)) used.set(id, top.get(id)); } }
const bad=[...used].filter(([k,v])=>v!=='function'); if(bad.length) console.error('NON-FUNCTION', bad);
console.log([...used.keys()].sort().join(', '));
