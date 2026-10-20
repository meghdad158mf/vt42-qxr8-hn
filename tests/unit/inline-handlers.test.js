// پل موقت onclick (بالای design/src/app.js): هر تابعی که دستگیره‌های درون HTML صدا می‌زنن باید
// در Object.assign(window, …) باشه (وگرنه دکمه بی‌صدا کار نمی‌کنه)، و هر نامی که دیگه
// صدا زده نمی‌شه باید از فهرست حذف بشه تا پل در مرحله‌های بعد واقعاً کوچیک بشه.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../design/src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../design/ita-monitoring-prototype.html', import.meta.url), 'utf8');

// تابع‌های سطح بالای app.js (کد بدون تورفتگی)
const topFns = new Set([...app.matchAll(/^(?:async )?function (\w+)\s*\(/gm)].map((m) => m[1]));
const bridge = (() => {
  const m = app.match(/^Object\.assign\(window, \{([\s\S]*?)\}\);/m);
  return new Set(m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : []);
})();
// بدنه‌ی هر on…="…" (در صفحه و در رشته‌هایی که app.js می‌سازه) تا کوتیشن بسته
function handlerNames(text) {
  const out = new Set();
  for (const m of text.matchAll(/\bon[a-z]+\s*=\s*\\?(["'])/g)) {
    const start = m.index + m[0].length;
    const body = text.slice(start, text.indexOf(m[1], start)).replace(/\$\{[^}]*\}/g, '');
    for (const id of body.match(/[A-Za-z_$][\w$]*/g) || []) if (topFns.has(id)) out.add(id);
  }
  return out;
}
const used = new Set([...handlerNames(html), ...handlerNames(app)]);

describe('پل موقت دستگیره‌های درون HTML', () => {
  it('پل پیدا شد', () => expect(bridge.size).toBeGreaterThan(0));
  it('هر تابع صدازده‌شده در پل هست', () => {
    expect([...used].filter((n) => !bridge.has(n))).toEqual([]);
  });
  it('نام اضافه در پل نیست', () => {
    expect([...bridge].filter((n) => !used.has(n))).toEqual([]);
  });
  it('همه‌ی نام‌های پل تابع واقعی‌اند', () => {
    expect([...bridge].filter((n) => !topFns.has(n))).toEqual([]);
  });
});
