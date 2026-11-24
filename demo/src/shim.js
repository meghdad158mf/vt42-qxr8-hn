// لایه‌ی نسخه‌ی نمایشی: پیش از خودِ برنامه اجرا می‌شود و هر درخواستی را که برنامه به «سوپابیس»
// می‌فرستد (در این نسخه SUPABASE_URL = پوشه‌ی sb همین سایت) خودش جواب می‌دهد:
//   • ورود → api.php روی همین هاست (بررسی رمز و انقضای ۱۰ روزه روی سرور)
//   • خواندن جدول‌ها → داده‌ای که api.php فقط بعد از ورود موفق می‌فرستد
//   • ترجمه → ترجمه‌های آماده‌ی داخل همان داده
// هیچ درخواستی به سرور واقعی سامانه نمی‌رود.
import { SUPABASE_URL } from '../../design/src/core/config.js';
import { runQuery } from './pgrest.js';

const API = new URL('api.php', location.href).href;
const realFetch = window.fetch.bind(window);
const DAY = 864e5;

let DB = null;          // جدول‌ها پس از ورود
let META = {};          // historic، translations، capturedAt
let loading = null;

function tehranDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// داده یک‌بار ساخته شده؛ همه‌ی زمان‌ها به همان اندازه جلو می‌روند تا «امروز» همیشه امروز باشد
const ISO_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
function shiftDates(obj, deltaMs, deltaDays) {
  const shiftDate = (s) => {
    const d = new Date(s + 'T12:00:00Z');
    return new Date(d.getTime() + deltaDays * DAY).toISOString().slice(0, 10);
  };
  const walk = (v) => {
    if (typeof v === 'string') {
      if (ISO_RX.test(v)) { const t = Date.parse(v); return isNaN(t) ? v : new Date(t + deltaMs).toISOString(); }
      if (DATE_RX.test(v)) return shiftDate(v);
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
    return v;
  };
  return walk(obj);
}

function token() { try { return sessionStorage.getItem('jarian_token'); } catch (e) { return null; } }

let DB_TOKEN = null;
async function ensureData() {
  if (DB && DB_TOKEN === token()) return true;
  if (DB) { DB = null; loading = null; }
  if (!token()) return false;
  DB_TOKEN = token();
  if (!loading) {
    loading = (async () => {
      const r = await realFetch(API + '?a=data', { headers: { 'X-Demo-Token': token() } });
      if (!r.ok) return false;
      const d = await r.json();
      const now = Date.now();
      const cap = Date.parse(d.meta.capturedAt);
      const deltaMs = now - cap;
      const deltaDays = Math.round((Date.parse(tehranDay(now)) - Date.parse(tehranDay(cap))) / DAY);
      DB = shiftDates(d.tables, deltaMs, deltaDays);
      META = d.meta;
      return true;
    })().finally(() => { if (!DB) loading = null; });
  }
  return loading;
}

function reply(body, status = 200, headers = {}) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function bodyOf(init) {
  try { return JSON.parse((init && init.body) || '{}') || {}; } catch (e) { return {}; }
}

let loginMsg = '';
function showLoginMsg() {
  if (!loginMsg) return;
  const el = document.getElementById('login-error');
  if (el) { el.textContent = loginMsg; el.style.display = ''; }
}

async function demoLogin(password) {
  const r = await realFetch(API + '?a=login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ code: password }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 429) return reply({ retry_after: d.retry_after || 900 }, 429);
  if (!r.ok) {
    loginMsg = d.error === 'expired' ? 'اعتبار این رمز ورود به پایان رسیده است. برای دریافت رمز تازه با ارائه‌دهنده‌ی سامانه تماس بگیرید.'
      : d.error === 'invalid' ? '' : 'ورود ممکن نشد. لحظاتی دیگر دوباره امتحان کنید.';
    if (loginMsg) setTimeout(showLoginMsg, 0);
    return reply({ error: 'invalid' }, 401);
  }
  loginMsg = '';
  try { sessionStorage.setItem('jarian_token', d.token); } catch (e) { /* */ }
  if (!(await ensureData())) return reply({ error: 'invalid' }, 401);
  return reply({ token: d.token, role: 'app_viewer' });
}

const RPC = {
  monitored_source_counts: () => META.sources || { channels: 0, newspapers: 0, crawl: 0 },
  hidden_post_ids: () => [],
  log_page_view: () => null,
  log_client_error: () => null,
};

async function handleRest(path, search, init) {
  const method = ((init && init.method) || 'GET').toUpperCase();
  const m = path.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)/);
  if (!m) return reply([]);
  const [, isRpc, name] = m;
  if (isRpc && name === 'login') return demoLogin(bodyOf(init).password || '');
  if (isRpc && (name === 'otp_request' || name === 'login_otp' || name === 'login_admin')) return reply({ error: 'not_found' }, 404);
  if (isRpc && name === 'log_client_error') return reply(null);
  // پیش از ورود فقط تنظیمات صفحه‌ی ورود خوانده می‌شود
  if (name === 'site_settings' && !token()) return reply([]);
  if (!(await ensureData())) return reply({ message: 'JWT expired' }, 401);
  if (isRpc) { const fn = RPC[name]; return reply(fn ? fn(bodyOf(init)) : null); }
  if (method !== 'GET' && method !== 'HEAD') return reply(null, 201);
  const { rows, total, offset } = runQuery(DB, name, search, { historic: (META.historic || {})[name] || 0 });
  const range = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`;
  return reply(rows, 200, { 'Content-Range': range });
}

function handleFunction(path, init) {
  if (path.endsWith('/translate')) {
    const b = bodyOf(init);
    const key = b.postId ? 'p' + b.postId : b.mentionId ? 'm' + b.mentionId : '';
    const t = (META.translations || {})[key];
    return new Promise((res) => setTimeout(() => res(t ? reply(t) : reply({ error: 'not_available' }, 404)), 700));
  }
  return Promise.resolve(reply({}));
}

window.fetch = function demoFetch(input, init) {
  const url = typeof input === 'string' ? input : input && input.url;
  if (url && url.startsWith(SUPABASE_URL)) {
    const u = new URL(url);
    const path = u.pathname.slice(new URL(SUPABASE_URL).pathname.length);
    if (path.startsWith('/rest/v1/')) return handleRest(path, u.search, init);
    if (path.startsWith('/functions/v1/')) return handleFunction(path, init);
    if (path.startsWith('/storage/v1/object/sign/') && (init && (init.method || '').toUpperCase() === 'POST')) {
      const bucket = path.split('/')[5];
      const paths = bodyOf(init).paths || [];
      return Promise.resolve(reply(paths.map((p) => ({ path: p, signedURL: `/object/sign/${bucket}/${p}` }))));
    }
    if (path.startsWith('/storage/v1/object/remove/')) return Promise.resolve(reply([]));
  }
  return realFetch(input, init);
};

// پیوندهای بیرونی (منبع خبر، کانال‌ها) در نسخه‌ی نمایشی به جایی نمی‌روند — نشانی‌ها ساختگی‌اند
function demoToast(msg) {
  let t = document.getElementById('demo-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'demo-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  let u;
  try { u = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
  if (u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:') return;
  e.preventDefault();
  e.stopPropagation();
  demoToast('در نسخه‌ی نمایشی، پیوند به منبع اصلی غیرفعال است.');
}, true);
