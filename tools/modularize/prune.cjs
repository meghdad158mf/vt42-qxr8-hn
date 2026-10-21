// نام‌های import‌شده‌ای که ESLint «استفاده نشده» می‌دونه از خطوط import حذف می‌شن
const { execSync } = require('child_process'); const fs = require('fs');
const lint = JSON.parse(execSync('npx eslint design/src -f json || true', { cwd: require('path').resolve(__dirname, '../..'), maxBuffer: 1 << 26 }).toString());
for (const r of lint) {
  const lines = fs.readFileSync(r.filePath, 'utf8').split('\n'); let changed = false;
  for (const m of r.messages.filter(m => m.ruleId === 'no-unused-vars')) {
    const name = (m.message.match(/'(.+?)'/) || [])[1]; const i = m.line - 1;
    if (!/^import \{/.test(lines[i])) continue;
    lines[i] = lines[i].replace(new RegExp('([{,]\\s*)' + name + '(\\s*[,}])'), (all, a, b) => (b.trim() === '}' ? (a.trim() === '{' ? '{ ' : '') + ' }' : a)).replace(/,\s*}/, ' }').replace(/{\s+,/, '{ ').replace(/\s{2,}/g, ' ');
    changed = true; console.log('pruned', name, 'in', r.filePath.split('/src/')[1]);
  }
  const out = lines.filter(l => !/^import \{\s*\} from/.test(l));
  if (changed) fs.writeFileSync(r.filePath, out.join('\n'));
}
