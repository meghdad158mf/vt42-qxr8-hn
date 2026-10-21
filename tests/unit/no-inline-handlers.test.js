// هیچ دستگیره‌ی درون HTML (onclick="…"، onsubmit، onchange، …) نه در صفحه و نه در HTMLهایی که ماژول‌ها
// می‌سازن (مرحله‌ی ۸ج): تابع‌های ES module سراسری نیستن و چنین دستگیره‌ای بی‌صدا کار نمی‌کنه. به‌جاش
// addEventListener یا event delegation با data-* (CLAUDE.md، «ماژولار کردن»). پل موقت window هم دیگه نیست.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../../design/src/', import.meta.url);
const html = readFileSync(new URL('../../design/ita-monitoring-prototype.html', import.meta.url), 'utf8');
const modules = readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, src: readFileSync(new URL(f, SRC), 'utf8') }));
// کامنت‌ها کنار گذاشته می‌شن (توضیح «قبلاً onclick=…» دستگیره نیست)
const code = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const INLINE = /<[a-z][^>]*\son[a-z]+\s*=\s*\\?["']/i;

describe('دستگیره‌ی درون HTML', () => {
  it('در صفحه نیست', () => {
    expect(html.split('\n').filter((l) => INLINE.test(l)).map((l) => l.trim().slice(0, 120))).toEqual([]);
  });
  it('در HTMLهایی که ماژول‌ها می‌سازن نیست', () => {
    const bad = modules.flatMap(({ f, src }) => code(src).split('\n').filter((l) => INLINE.test(l)).map((l) => `${f}: ${l.trim().slice(0, 100)}`));
    expect(bad).toEqual([]);
  });
  it('پل window (Object.assign(window, …)) نیست', () => {
    expect(modules.filter(({ src }) => /Object\.assign\(\s*window\b/.test(src)).map(({ f }) => f)).toEqual([]);
  });
});
