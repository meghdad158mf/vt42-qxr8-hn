// کمک‌تابع‌های بارگذاری فایل در Storage (۵.۲۰.۰): سقف حجم، ترتیب صفحه‌ها، پیشرفت، پیام خطا، پاک‌سازی فایل‌های نیمه‌کاره
import { authToken } from '../core/session.js';
import { faNum } from '../core/text.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../core/config.js';

// ---- کمک‌تابع‌های بارگذاری (۵.۲۰.۰): سقف حجم، ترتیب صفحه‌ها، پیام خطای قابل‌فهم و
// پاک‌کردن فایل‌های نیمه‌کاره (تا فضای ۱ گیگی سوپابیس با بارگذاری ناموفق پر نشه)
export const UPLOAD_MAX_MB = 50; // سقف هر فایل در پلن رایگان سوپابیس
export async function uploadHttpError(r, file){
  const err = new Error('upload failed: ' + (file && file.name));
  err.status = r.status;
  try{ err.body = await r.text(); }catch(e){}
  return err;
}
export function uploadTooBig(files){
  const big = files.find(f=>f && f.size > UPLOAD_MAX_MB * 1048576);
  return big ? 'فایل «' + big.name + '» ' + faNum(+(big.size / 1048576).toFixed(1)) + ' مگابایت است؛ حداکثر حجم هر فایل ' + faNum(UPLOAD_MAX_MB) + ' مگابایت است. فایل را فشرده‌تر کنید یا به چند بخش تقسیم کنید.' : '';
}
// ترتیب عددی بر اساس نام (صفحه-۲ قبل از صفحه-۱۰) — مرورگرها ترتیب انتخاب رو تضمین نمی‌کنن
export function sortFilesByName(files){
  return files.slice().sort((a,b)=>a.name.localeCompare(b.name, 'en', { numeric:true, sensitivity:'base' }));
}
export function uploadErrorMsg(e){
  if(e && (e.status === 413 || /413|too large|exceeded the maximum/i.test(e.body || ''))) return 'حجم فایل بیش از حد مجاز سوپابیس است؛ فایل را فشرده‌تر کنید.';
  if(e instanceof TypeError) return 'اتصال اینترنت قطع شد؛ دوباره امتحان کنید.';
  if(e && (e.status === 401 || e.status === 403)) return 'نشست شما منقضی شده یا اجازه‌ی بارگذاری ندارید؛ یک‌بار خارج و دوباره وارد شوید.';
  return 'بارگذاری انجام نشد؛ دوباره امتحان کنید. اگر تکرار شد، صفحه‌ی «وضعیت سامانه» را ببینید.';
}
export async function removeStoragePaths(bucket, paths){
  paths = (paths || []).filter(Boolean);
  if(!paths.length) return;
  try{
    await fetch(SUPABASE_URL + '/storage/v1/object/remove/' + bucket, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
  }catch(e){}
}
export const publicPathOf = (url, bucket) => (url && url.includes('/' + bucket + '/')) ? url.split('/' + bucket + '/')[1] : null;
// بارگذاری چند فایل پشت‌سرهم با «فایل ۳ از ۸» روی دکمه؛ اگه یکی شکست بخوره، قبلی‌ها پاک می‌شن
export async function uploadFilesWithProgress(files, uploadOne, bucket, btn){
  const paths = [];
  try{
    for(let i = 0; i < files.length; i++){
      btn.textContent = files.length > 1 ? 'در حال بارگذاری فایل ' + faNum(i + 1) + ' از ' + faNum(files.length) + '…' : 'در حال بارگذاری…';
      paths.push(await uploadOne(files[i]));
    }
    return paths;
  }catch(e){
    await removeStoragePaths(bucket, paths);
    throw e;
  }
}
// عکس پیش‌فرض هر کانال، برای پست‌هایی که خودشون عکس ندارن — دقیقاً
// همون الگوی bucket عمومی jpg جلد مجلات (uploadCoverFile بالا)
export async function uploadChannelAvatarFile(file){
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + safeName;
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/channel-avatars/' + path, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + authToken, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if(!r.ok) throw new Error('avatar upload failed');
  return SUPABASE_URL + '/storage/v1/object/public/channel-avatars/' + path;
}

