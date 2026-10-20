// اعتبار کد ملی و یکدست کردن شماره‌ی موبایل (هم صفحه‌ی ورود هم فرم‌های مدیر)
import { faDigitsToEn } from './text.js';

// شماره‌ی موبایل با فاصله/خط تیره/پرانتز و پیش‌شماره‌ی ۹۸+ یا ۰۰۹۸ → 09xxxxxxxxx (۵.۲۰.۰)
export function normalizeIrMobile(v){
  let d = faDigitsToEn(v || '').replace(/[^\d+]/g, '');
  if(d.startsWith('+')) d = d.slice(1);
  if(d.startsWith('0098')) d = d.slice(4);
  else if(d.startsWith('98') && d.length === 12) d = d.slice(2);
  if(/^9\d{9}$/.test(d)) d = '0' + d;
  return d;
}
// اعتبار کد ملی (رقم کنترل) — همون قاعده‌ی nid_valid سمت سرور
export function nidValid(n){
  if(!/^\d{10}$/.test(n) || /^(\d)\1{9}$/.test(n)) return false;
  let s = 0; for(let i = 0; i < 9; i++) s += +n[i] * (10 - i);
  const r = s % 11, c = +n[9];
  return r < 2 ? c === r : c === 11 - r;
}
