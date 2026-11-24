// موتور کوچک شبیه PostgREST برای نسخه‌ی نمایشی: همان کوئری‌هایی که سایت به سوپابیس می‌فرستد
// (فیلتر، مرتب‌سازی، limit/offset، شمارش دقیق، جاسازی posts(*)) روی داده‌ی داخل حافظه اجرا می‌شود.
// فقط خواندن واقعی است؛ نوشتن‌ها (نظر، اشتراک…) پذیرفته می‌شوند ولی چیزی را عوض نمی‌کنند.

function parseValue(v) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a), nb = Number(b);
  if (typeof a !== 'boolean' && a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && !/^\d{4}-/.test(String(a))) return na - nb;
  return String(a) < String(b) ? -1 : 1;
}

function splitList(s) {
  // «(a,b,"c,d")» → ['a','b','c,d']
  const inner = s.replace(/^\(|\)$/g, '').replace(/^\{|\}$/g, '');
  const out = [];
  let cur = '', q = false;
  for (const ch of inner) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '' || out.length) out.push(cur);
  return out;
}

function likeRx(pat, flags) {
  const esc = pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*');
  return new RegExp('^' + esc + '$', flags);
}

function makePredicate(col, expr) {
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf('.');
  const op = dot === -1 ? expr : expr.slice(0, dot);
  const raw = dot === -1 ? '' : expr.slice(dot + 1);
  let fn;
  switch (op) {
    case 'eq': { const v = parseValue(raw); fn = (x) => cmp(x, v) === 0 && x !== null && x !== undefined; break; }
    case 'neq': { const v = parseValue(raw); fn = (x) => x === null || x === undefined || cmp(x, v) !== 0; break; }
    case 'gt': fn = (x) => x !== null && x !== undefined && cmp(x, raw) > 0; break;
    case 'gte': fn = (x) => x !== null && x !== undefined && cmp(x, raw) >= 0; break;
    case 'lt': fn = (x) => x !== null && x !== undefined && cmp(x, raw) < 0; break;
    case 'lte': fn = (x) => x !== null && x !== undefined && cmp(x, raw) <= 0; break;
    case 'is': {
      const v = parseValue(raw);
      fn = v === null ? (x) => x === null || x === undefined : (x) => x === v;
      break;
    }
    case 'in': { const set = splitList(raw).map(String); fn = (x) => x !== null && x !== undefined && set.includes(String(x)); break; }
    case 'like': { const rx = likeRx(raw, ''); fn = (x) => typeof x === 'string' && rx.test(x); break; }
    case 'ilike': { const rx = likeRx(raw, 'i'); fn = (x) => typeof x === 'string' && rx.test(x); break; }
    case 'cs': { const need = splitList(raw); fn = (x) => Array.isArray(x) && need.every((n) => x.includes(n)); break; }
    case 'ov': { const any = splitList(raw); fn = (x) => Array.isArray(x) && any.some((n) => x.includes(n)); break; }
    default: fn = () => true;
  }
  return (row) => (neg ? !fn(row[col]) : fn(row[col]));
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function applySelect(rows, select, db) {
  if (!select || select === '*') return rows;
  // جاسازی ساده: «*,posts(*)» (newsletter_posts) — ردیف کامل پست با کلید post_id
  const embed = select.match(/(?:^|,)([a-z_]+)\(\*\)/);
  const cols = select.split(',').filter((c) => !/\(/.test(c) && c !== '*');
  const all = select.split(',').includes('*');
  return rows.map((r) => {
    let o = all ? { ...r } : {};
    if (!all) for (const c of cols) o[c] = r[c] === undefined ? null : r[c];
    if (embed) {
      const t = embed[1];
      const fk = t.replace(/s$/, '') + '_id';
      o[t] = (db[t] || []).find((x) => x.id === r[fk]) || null;
    }
    return o;
  });
}

/**
 * یک درخواست خواندن را اجرا می‌کند.
 * @returns {{rows: object[], total: number}}
 */
export function runQuery(db, table, search, { historic = 0 } = {}) {
  const params = new URLSearchParams(search);
  let rows = (db[table] || []).slice();
  let filtered = false;
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    if (k === 'or' || k === 'and') continue; // سایت از این‌ها استفاده نمی‌کند
    const p = makePredicate(k, v);
    rows = rows.filter(p);
    if (!(k === 'hidden_at' || k === 'post_id')) filtered = true;
  }
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((s) => {
      const [col, ...mods] = s.split('.');
      const desc = mods.includes('desc');
      const nullsFirst = mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : desc;
      return { col, desc, nullsFirst };
    });
    rows.sort((a, b) => {
      for (const k of keys) {
        const x = a[k.col], y = b[k.col];
        const xn = x === null || x === undefined, yn = y === null || y === undefined;
        if (xn || yn) {
          if (xn && yn) continue;
          return xn === k.nullsFirst ? -1 : 1;
        }
        const c = cmp(x, y);
        if (c) return k.desc ? -c : c;
      }
      return 0;
    });
  }
  const total = rows.length + (filtered ? 0 : historic);
  const offset = parseInt(params.get('offset') || '0', 10) || 0;
  const limit = params.has('limit') ? parseInt(params.get('limit'), 10) : Infinity;
  rows = rows.slice(offset, offset + limit);
  return { rows: applySelect(rows, params.get('select'), db), total, offset };
}
