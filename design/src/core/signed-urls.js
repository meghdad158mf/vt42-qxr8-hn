// لینک امن کوتاه‌عمر برای فایل‌های bucketهای خصوصی Storage (مجلات، بسته‌ها، گزارش‌های مدارس)
// نه لینک مستقیم/دانلود دائمی — جلوی دانلود عادی رو می‌گیره، ولی جلوی اسکرین‌شات یا کاربر فنی مصمم رو نه
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { authToken } from './session.js';

export const DV_TTL = 600; // لینک امن ۱۰ دقیقه‌ای برای ورق زدن (قبلاً ۶۰ ثانیه برای باز کردن تک‌فایل)
export async function signStoragePaths(bucket, paths){
  const res = await fetch(SUPABASE_URL + '/storage/v1/object/sign/' + bucket, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: DV_TTL, paths }),
  });
  if(!res.ok) throw new Error('sign failed');
  const out = await res.json();
  const map = new Map((Array.isArray(out) ? out : []).filter(x => x && x.signedURL && !x.error).map(x => [x.path, SUPABASE_URL + '/storage/v1' + x.signedURL]));
  return paths.map(p => map.get(p) || null);
}

