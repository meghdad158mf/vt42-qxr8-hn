// ماژول‌های design/src نباید import چرخه‌ای داشته باشن (جز ارجاع موقت features/ → app.js که
// app-back-refs.test.js کنترلش می‌کنه). چرخه = ترتیب اجرا شکننده و خطای TDZ دیر پیدا می‌شه.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

const SRC = new URL('../../design/src/', import.meta.url);
const files = readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\\/g, '/'));
const graph = Object.fromEntries(files.map((f) => {
  const deps = [...readFileSync(new URL(f, SRC), 'utf8').matchAll(/^import (?:[^'"]*from )?'(\.{1,2}\/[^']+)';/gm)]
    .map((m) => posix.normalize(posix.join(posix.dirname(f), m[1])))
    .filter((d) => d !== 'app.js');
  return [f, deps];
}));

function findCycle() {
  const state = {}; const stack = [];
  const visit = (f) => {
    if (state[f] === 1) return stack.slice(stack.indexOf(f)).concat(f);
    if (state[f] === 2) return null;
    state[f] = 1; stack.push(f);
    for (const d of graph[f] || []) { const c = visit(d); if (c) return c; }
    stack.pop(); state[f] = 2; return null;
  };
  for (const f of files) { const c = visit(f); if (c) return c; }
  return null;
}

describe('import چرخه‌ای', () => {
  it('همه‌ی importهای نسبی به فایل موجود اشاره می‌کنن', () => {
    const missing = Object.entries(graph).flatMap(([f, ds]) => ds.filter((d) => !files.includes(d)).map((d) => `${f} → ${d}`));
    expect(missing).toEqual([]);
  });
  it('هیچ چرخه‌ای نیست', () => expect(findCycle()).toBeNull());
});
