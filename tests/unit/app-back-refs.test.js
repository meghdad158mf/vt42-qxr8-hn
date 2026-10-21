// ارجاع موقت ماژول‌های features/ و admin/ به app.js (تا وقتی بقیه‌ی app.js هم تقسیم بشه).
// app.js این ماژول‌ها رو import می‌کنه و اون‌ها هم چند تابع app.js رو → چرخه‌ی import.
// چرخه فقط وقتی امنه که نام‌های واردشده «تعریف تابع» باشن (از اول ماژول آماده‌ان)؛
// let/const در لحظه‌ی اجرای ماژول feature هنوز مقدار ندارن (TDZ) و صفحه رو می‌شکنن.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../../design/src/', import.meta.url);
const read = (f) => readFileSync(new URL(f, SRC), 'utf8');
const app = read('app.js');
const appFns = new Set([...app.matchAll(/^export (?:async )?function (\w+)\s*\(/gm)].map((m) => m[1]));
const files = readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js') && f !== 'app.js' && f !== 'main.js');

const backRefs = files.flatMap((f) =>
  [...read(f).matchAll(/^import \{([^}]*)\} from '((?:\.\.?\/)+app\.js)';/gm)].map((m) => ({
    file: f, names: m[1].split(',').map((s) => s.trim()).filter(Boolean),
  })));

describe('ارجاع موقت به app.js', () => {
  it('فقط از features/ و admin/ (هسته، اجزای رابط و داده هرگز به app.js وابسته نیستن)', () => {
    expect(backRefs.filter((r) => !/^(features|admin)\//.test(r.file)).map((r) => r.file)).toEqual([]);
  });
  // کد مدیریت فقط از خودِ admin/ و app.js صدا زده می‌شه؛ بقیه با adminHook (core/admin-hooks.js)
  it('هیچ ماژول بیننده‌ای از admin/ import نمی‌کنه', () => {
    const bad = files.filter((f) => !f.startsWith('admin/'))
      .filter((f) => /^import [^;]*from '(?:\.\.?\/)+admin\//m.test(read(f)) || /^import [^;]*from '\.\/admin\//m.test(read(f)));
    expect(bad).toEqual([]);
  });
  it('فقط تابع‌های export‌شده‌ی app.js', () => {
    const bad = backRefs.flatMap((r) => r.names.filter((n) => !appFns.has(n)).map((n) => `${r.file}: ${n}`));
    expect(bad).toEqual([]);
  });
});
