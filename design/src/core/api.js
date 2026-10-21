// درخواست به PostgREST سوپابیس با کلید anon + توکن نشست
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { authToken } from './session.js';
import { reportClientError } from './error-reporting.js';

// ۴۰۱ با توکن = نشست منقضی‌شده (توکن ۲۴ ساعت اعتبار داره) — loadAllAndEnter بعد از loadAll می‌خونش
export let SESSION_EXPIRED = false;
export function resetSessionExpired(){ SESSION_EXPIRED = false; }

export function api(path, opts){
  opts = opts || {};
  const headers = Object.assign({ apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, opts.headers||{});
  if(authToken) headers.Authorization = 'Bearer ' + authToken;
  return fetch(SUPABASE_URL + '/rest/v1' + path, Object.assign({}, opts, { headers })).then(r=>{
    if(r.status === 401 && authToken) SESSION_EXPIRED = true;
    if(r.status >= 500) reportClientError('خطای سرور ' + r.status + ' در ' + path.split('?')[0]);
    return r;
  });
}

// شمارش دقیق و تاریخی (نه محدود به limit صفحه‌بندی‌شده‌ی کش‌های محلی مثل POSTS_CACHE) —
// با هدر count=exact پستگرست، بدون نیاز به دانلود واقعی ردیف‌ها، از Content-Range می‌خونیم
// column پیش‌فرض 'id'ه (همه‌ی جدول‌های اصلی این ستون رو دارن)؛ برای Viewهایی
// که ستون id ندارن (مثل newspaper_unique_slugs، migration_030)، باید صریح
// یه ستون واقعاً موجود پاس داده بشه — وگرنه PostgREST با ۴۰۰ رد می‌کنه.
export async function fetchExactCount(path, column){
  try{
    const col = column || 'id';
    const sep = path.includes('?') ? '&' : '?';
    const r = await api(path + sep + 'select=' + col + '&limit=1', { headers: { Prefer: 'count=exact', Range: '0-0' } });
    if(!r.ok) return 0;
    const cr = r.headers.get('content-range');
    if(!cr) return 0;
    const total = cr.split('/')[1];
    return total === '*' ? 0 : (parseInt(total, 10) || 0);
  }catch(e){ return 0; }
}
