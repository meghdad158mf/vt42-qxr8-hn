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
