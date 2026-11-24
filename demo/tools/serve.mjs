// پیش‌نمایش محلی نسخه‌ی نمایشی بدون PHP:  npm run demo:serve  → http://localhost:8787/
// پوشه‌ی dist-demo را سرو می‌کند و api.php را با همان قواعد (رمز، ۱۰ روز از نخستین ورود، ۶۰ روز
// برای رمز استفاده‌نشده، قفل ۵ اشتباه در ۱۵ دقیقه) شبیه‌سازی می‌کند. وضعیت فقط در حافظه است.
// DEMO_SHIFT_DAYS=11 npm run demo:serve  → ساعت سرور ۱۱ روز جلوتر (برای آزمون انقضا)
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist-demo');
const PORT = Number(process.env.PORT || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };
const priv = (n) => { const s = readFileSync(resolve(ROOT, 'private', n), 'utf8'); return s.startsWith('<?php') ? s.slice(s.indexOf('\n') + 1) : s; };
const now = () => Math.floor(Date.now() / 1000) + Number(process.env.DEMO_SHIFT_DAYS || 0) * 86400;

const st = { codes: {}, sessions: {}, fails: {} };
const norm = (s) => String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\s+/g, '').toUpperCase();
const expired = (cfg, row, t) => (row && row.first ? t > row.first + 10 * 86400 : t > cfg.created + 60 * 86400);

function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }

function api(req, res, a, body) {
  const cfg = JSON.parse(priv('codes.php'));
  // فقط در پیش‌نمایش محلی: رمز آزمایشی تا رمزهای واقعی برای آزمون مصرف نشوند (روی هاست وجود ندارد)
  cfg.codes = [...cfg.codes, { id: 'test', label: 'آزمایشی', hash: createHash('sha256').update(cfg.salt + 'JR-TEST-0000').digest('hex') }];
  const t = now();
  if (a === 'login') {
    const ip = req.socket.remoteAddress;
    const fails = (st.fails[ip] || []).filter((x) => x > t - 900);
    if (fails.length >= 5) return json(res, 429, { error: 'locked', retry_after: 900 - (t - Math.min(...fails)) });
    const code = norm(JSON.parse(body || '{}').code);
    const hash = createHash('sha256').update(cfg.salt + code).digest('hex');
    const hit = code && cfg.codes.find((c) => c.hash === hash);
    if (!hit) { fails.push(t); st.fails[ip] = fails; return json(res, 401, { error: 'invalid' }); }
    delete st.fails[ip];
    const row = st.codes[hit.id] || { first: null, last: null, uses: 0 };
    if (expired(cfg, row, t)) return json(res, 403, { error: 'expired' });
    row.first = row.first || t; row.last = t; row.uses++;
    st.codes[hit.id] = row;
    const token = randomBytes(24).toString('hex');
    st.sessions[token] = { id: hit.id, t };
    return json(res, 200, { token });
  }
  if (a === 'data') {
    const s = st.sessions[req.headers['x-demo-token'] || ''];
    if (!s || expired(cfg, st.codes[s.id], t)) return json(res, 401, { error: 'session' });
    // مثل api.php: داده‌ی از پیش gzip شده، با سربرگ فشرده‌سازی و ۱۰ دقیقه کش مرورگر
    const raw = readFileSync(resolve(ROOT, 'private', 'data.php'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'private, max-age=600', Vary: 'Accept-Encoding, X-Demo-Token' });
    return res.end(raw.subarray(raw.indexOf(10) + 1));
  }
  return json(res, 404, { error: 'not_found' });
}

createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (u.pathname.endsWith('/api.php')) return api(req, res, u.searchParams.get('a'), body);
    if (u.pathname.startsWith('/private')) { res.writeHead(403); return res.end('Forbidden'); }
    let f = normalize(resolve(ROOT, '.' + decodeURIComponent(u.pathname)));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) f = resolve(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
}).listen(PORT, () => console.log(`نسخه‌ی نمایشی: http://localhost:${PORT}/`));
