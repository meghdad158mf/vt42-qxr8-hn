// تنظیمات سایت (site_settings، migration_042/043): حالت تعمیر، بخش‌های پنهان، مدت نگهداری رسانه — خواندن برای همه، نوشتن از admin/
import { api } from '../core/api.js';

// ---- نمایش سایت: حالت تعمیر + روشن/خاموش کردن بخش‌ها (migration_042) ----
// جدول site_settings: key='maintenance' → {on, message, until}، key='hidden_sections' →
// آرایه‌ی «بخش» یا «بخش/تب» پنهان از بیننده‌ها. مدیر همه‌چیز رو با برچسب «پنهان» می‌بینه.
// این فقط پنهان‌کردن رابطه (داده‌ها با RLS همچنان خواندنی‌ان) — برای «در دست ساخت»/مشکل موقت.
// فهرست بخش‌ها و تب‌ها: SITE_VIS_ITEMS در data/site-sections.js
export const MAINT_DEFAULT_MSG = 'سامانه در حال به‌روزرسانی است و به‌زودی در دسترس خواهد بود.';
export var SITE_SETTINGS = { maintenance:{ on:false, message:'', until:'' }, hidden_sections:[] };
export var SITE_SETTINGS_MISSING = false;
export async function loadSiteSettings(){
  try{
    const r = await api('/site_settings?select=key,value');
    SITE_SETTINGS_MISSING = r.status === 404 || r.status === 400;
    if(!r.ok) return;
    (await r.json()).forEach(x=>{ SITE_SETTINGS[x.key] = x.value; });
  }catch(e){}
}
export function maintOn(){ return !!(SITE_SETTINGS.maintenance && SITE_SETTINGS.maintenance.on); }
export function siteHiddenSet(){ const h = SITE_SETTINGS.hidden_sections; return new Set(Array.isArray(h) ? h : []); }
// ---- مدت نگهداری عکس/فیلم پست‌ها (۵.۲۵.۰، site_settings.media_retention_hours) ----
// cleanup_media.py همین مقدار رو می‌خونه (روزی ۲ بار). تخمین حجم: حجم post-media تقریباً
// متناسب با بیشترین عمر فایل‌هاست = مدت نگهداری + ۱۲ ساعت فاصله‌ی دو پاک‌سازی.
export var RETENTION_OPTIONS = [[12,'۱۲ ساعت'],[24,'۱ روز'],[48,'۲ روز'],[72,'۳ روز']];
export function mediaRetentionHours(){
  const h = Number(SITE_SETTINGS.media_retention_hours);
  return RETENTION_OPTIONS.some(([x])=>x === h) ? h : 12;
}

