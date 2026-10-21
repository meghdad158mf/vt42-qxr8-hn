// «پشتیبان تنظیمات» (۵.۱۸.۰): فایل SQL با insert … on conflict do nothing برای جدول‌های تنظیماتی
import { api } from '../../core/api.js';
import { calParts } from '../../core/date.js';
import { downloadBlob } from '../download.js';
import { escHtml, faNum } from '../../core/text.js';
import { lsGet, lsSet } from '../../core/local-store.js';
import { showToast } from '../../ui/toast.js';

// ---- پشتیبان تنظیمات («تنظیمات بخش‌ها» ← امنیت، فقط مدیر) ----
// خروجی = یک فایل SQL برای SQL Editor سوپابیس: برای هر جدول یه بلوک DO که اگه
// جدول وجود داشت، ردیف‌ها رو با jsonb_populate_recordset و on conflict do nothing
// درج می‌کنه (شناسه‌ها حفظ می‌شن تا ارتباط منبع↔موضوع/منطقه/گروه درست بمونه) و
// sequence رو جلو می‌بره. فقط ردیف‌های نبود اضافه می‌شن؛ اجرای چندباره بی‌خطره.
// ترتیب جدول‌ها = ترتیب وابستگی (کلید خارجی). جدول جدیدِ تنظیماتی → به این فهرست.
export const BACKUP_TABLES = [
  ['categories', 'موضوع منابع'], ['regions', 'مناطق'], ['channels', 'منابع (با بخش‌ها، منطقه و مشخصات)'],
  ['profile_groups', 'گروه‌های چهره‌ها و سازمان‌ها'], ['channel_profile_groups', 'عضویت منابع در گروه‌ها'],
  ['news_topics', 'میان‌برهای جست‌وجوی وب‌سایت‌ها'], ['dossier_topics', 'پرونده‌های موضوعی'],
  ['app_users', 'فهرست کاربران'], ['notify_subscribers', 'مشترکین اطلاع از انتشار'],
  ['announcements', 'اطلاعیه‌ها'], ['feedback', 'نظرات کاربران'],
  ['crawl_sites', 'منابع خزنده‌ی «درباره حوزه»'],
  ['site_settings', 'نمایش سایت (حالت تعمیر، بخش‌های پنهان)'],
];
export function renderBackupPanel(){
  const list = document.getElementById('backup-list');
  if(!list) return;
  list.innerHTML = BACKUP_TABLES.map(([, label])=>`<li>${escHtml(label)}</li>`).join('');
  const el = document.getElementById('backup-last');
  const last = lsGet('jarian_last_backup', null);
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  el.className = 'bk-last' + (days === null || days > 30 ? ' warn' : '');
  const sum = document.getElementById('backup-sum');
  if(sum) sum.textContent = last
    ? 'آخرین پشتیبان: ' + (days === 0 ? 'امروز' : faNum(days) + ' روز پیش') + (days > 30 ? '، وقت پشتیبان تازه است' : '')
    : 'هنوز پشتیبانی گرفته نشده؛ پیشنهاد می‌شود یک فایل بگیرید';
  if(sum) sum.style.color = (days === null || days > 30) ? '#b7800f' : '';
  el.textContent = last
    ? 'آخرین پشتیبان روی این مرورگر: ' + new Date(last).toLocaleDateString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long', year:'numeric' }) + (days > 30 ? '، بیش از یک ماه پیش؛ پیشنهاد می‌شود دوباره بگیرید.' : '')
    : 'هنوز روی این مرورگر پشتیبانی گرفته نشده.';
}
export async function backupFetchTable(t){
  const rows = [];
  for(let page = 0; page < 50; page++){
    const r = await api('/' + t + '?select=*&order=id.asc&limit=1000&offset=' + (page * 1000));
    if(r.status === 404 || (r.status === 400 && page === 0)) return null; // جدول هنوز ساخته نشده
    if(!r.ok) throw new Error(t + ' ' + r.status);
    const part = await r.json();
    rows.push(...part);
    if(part.length < 1000) break;
  }
  return rows;
}
export function buildBackupSql(data, when){
  const all = JSON.stringify(data);
  let tag = 'jarian';
  while(all.includes('$' + tag + '$')) tag += 'x';
  const J = '$' + tag + '$';
  let dtag = 'do';
  while(all.includes('$' + dtag + '$') || dtag === tag) dtag += 'x';
  const D = '$' + dtag + '$';
  const dateFa = when.toLocaleString('fa-IR', { timeZone:'Asia/Tehran', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const out = [
    '-- =====================================================================',
    '-- جریان — فایل پشتیبان تنظیمات',
    '-- ساخته‌شده: ' + dateFa,
    '-- استفاده: کل این متن را در Supabase ← SQL Editor ← New query بچسبانید و Run بزنید.',
    '-- فقط ردیف‌هایی که در دیتابیس نیستند اضافه می‌شوند؛ چیزی عوض یا پاک نمی‌شود',
    '-- و اجرای چندباره بی‌خطر است. روی پروژه‌ی تازه، اول schema.sql و migrationها.',
    '-- شامل نیست: پست‌ها، روزنامه‌ها، فایل‌های بسته‌ها/گزارش‌ها، رمزها.',
    '-- =====================================================================',
    '',
    'begin;',
    '',
  ];
  for(const [t, label] of BACKUP_TABLES){
    const rows = data[t];
    if(!rows){ out.push('-- ' + t + ' (' + label + '): در زمان پشتیبان‌گیری وجود نداشت', ''); continue; }
    out.push('-- ' + t + ' (' + label + '): ' + rows.length + ' ردیف');
    if(!rows.length){ out.push(''); continue; }
    const cols = Object.keys(rows[0]).map(c=>'"' + c.replace(/"/g, '""') + '"').join(', ');
    out.push(
      'do ' + D + ' begin',
      "  if to_regclass('public." + t + "') is not null then",
      '    insert into public.' + t + ' (' + cols + ')',
      '      select ' + cols + ' from jsonb_populate_recordset(null::public.' + t + ', ' + J + JSON.stringify(rows) + J + '::jsonb)',
      '      on conflict do nothing;',
      "    perform setval(pg_get_serial_sequence('public." + t + "', 'id'), greatest(coalesce((select max(id) from public." + t + "), 0), 1));",
      '  else',
      "    raise notice 'جدول " + t + " وجود ندارد و رد شد';",
      '  end if;',
      'end ' + D + ';',
      '');
  }
  out.push('commit;', '');
  return out.join('\n');
}
export async function downloadBackup(){
  const btn = document.getElementById('backup-btn');
  btn.disabled = true; btn.textContent = 'در حال آماده‌سازی…';
  try{
    const results = await Promise.all(BACKUP_TABLES.map(([t])=>backupFetchTable(t)));
    const data = {};
    BACKUP_TABLES.forEach(([t], i)=>{ data[t] = results[i]; });
    if(!data.channels || !data.channels.length) throw new Error('no channels');
    const when = new Date();
    const p = calParts(when, 'persian');
    const name = 'jarian-backup-' + p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0') + '.sql';
    downloadBlob(name, buildBackupSql(data, when), 'application/sql;charset=utf-8');
    lsSet('jarian_last_backup', when.toISOString());
    renderBackupPanel();
    const n = Object.values(data).reduce((a, r)=>a + (r ? r.length : 0), 0);
    showToast('فایل پشتیبان دانلود شد (' + faNum(n) + ' ردیف)');
  }catch(e){
    console.error(e);
    showToast('ساخت فایل پشتیبان انجام نشد؛ دوباره امتحان کنید');
  }finally{
    btn.disabled = false; btn.textContent = 'دانلود فایل پشتیبان';
  }
}

