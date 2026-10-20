// تاریخ: تبدیل شمسی ↔ میلادی و مرز «امروز/دیروز» بر اساس نیمه‌شب تهران
// ⚠️ هیچ‌وقت setHours(0,0,0,0) خام یا Math.floor روی تفاضل مستقیم — همیشه iranTodayStartMs/tehranDayDiff

export const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export function jalaliToGregorian(jy, jm, jd){
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if(days > 36524){ days--; gy += 100 * Math.floor(days / 36524); days %= 36524; if(days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if(days > 365){ gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const ml = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for(gm = 0; gm < 13 && gd > ml[gm]; gm++) gd -= ml[gm];
  return [gy, gm, gd];
}
export function jalaliMonthLength(jy, jm){
  if(jm <= 6) return 31;
  if(jm <= 11) return 30;
  const a = jalaliToGregorian(jy, 12, 30), b = jalaliToGregorian(jy + 1, 1, 1);
  return (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) ? 29 : 30;
}
export function calParts(date, cal){
  let fmt;
  try{ fmt = new Intl.DateTimeFormat('en-u-ca-' + cal + '-nu-latn', { year:'numeric', month:'numeric', day:'numeric', timeZone:'Asia/Tehran' }); }
  catch(e){ fmt = new Intl.DateTimeFormat('en-u-ca-islamic-nu-latn', { year:'numeric', month:'numeric', day:'numeric', timeZone:'Asia/Tehran' }); }
  const o = {};
  fmt.formatToParts(date).forEach(p=>{ if(p.type === 'year' || p.type === 'month' || p.type === 'day') o[p.type] = parseInt(p.value, 10); });
  return o;
}
// اول ماه شمسی جاری و قبلی، به‌صورت YYYY-MM-DD میلادی
export function jalaliMonthStarts(){
  const t = calParts(new Date(), 'persian');
  const iso = a => a[0] + '-' + String(a[1]).padStart(2, '0') + '-' + String(a[2]).padStart(2, '0');
  const py = t.month === 1 ? t.year - 1 : t.year, pm = t.month === 1 ? 12 : t.month - 1;
  return { cur: iso(jalaliToGregorian(t.year, t.month, 1)), prev: iso(jalaliToGregorian(py, pm, 1)) };
}
// شروع «امروز» رو صریح روی نیمه‌شب وقت ایران (نه ساعت محلی مرورگر
// بازدیدکننده) حساب می‌کنه — چون یه مدیر ممکنه از یه سیستم با تایم‌زون
// متفاوت وارد بشه و در اون صورت setHours(0,0,0,0) خام روی Date، نیمه‌شب
// همون تایم‌زون غلط رو حساب می‌کرد، نه نیمه‌شب واقعی ایران
export function iranTodayStartMs(){
  const iranDateStr = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  return new Date(iranDateStr + 'T00:00:00+03:30').getTime();
}
// چند تا نقطه از سایت («کنشگری مجازی»، «یادداشت‌ها»، «اخبار و رویدادها»،
// «پرونده‌های موضوعی») فیلتر «امروز/دیروز/هفته گذشته» داشتن که هرکدوم جدا و
// با معیار «فاصله‌ی خام از همین لحظه» (نه نیمه‌شب تقویمی) پیاده شده بود —
// یعنی مرز «امروز» با گذشت ساعت‌های شب به‌جای نیمه‌شب واقعی ایران، به
// ساعت لحظه‌ی بازدید کاربر (یا حتی تایم‌زون محلی مرورگرش) وابسته بود.
// طبق درخواست صریح کاربر، همه‌ی این‌ها یکدست به همون معیار iranTodayStartMs
// (نیمه‌شب تقویمی تهران) وصل شدن؛ diffDays=0 یعنی «امروز» (بعد از نیمه‌شب
// امروز تهران)، diffDays=1 یعنی «دیروز» (بین نیمه‌شب دیروز و امروز).
export function tehranDayDiff(dateStr){
  if(!dateStr) return Infinity;
  // به‌جای تفریق مستقیم زمان رویداد از نیمه‌شب امروز (که برای رویدادهای
  // «امروز» چون بعد از اون نیمه‌شب اتفاق افتادن، عدد منفی و با floor
  // اشتباه به -۱ گرد می‌شه)، اول نیمه‌شب همون روز تقویمیِ رویداد (به وقت
  // تهران) رو پیدا می‌کنیم و فاصله‌ی بین دو نیمه‌شب رو حساب می‌کنیم — همیشه
  // یه عدد صحیح دقیق از روزه، مستقل از ساعت دقیق رویداد
  const eventDateStr = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(dateStr));
  const eventDayStartMs = new Date(eventDateStr + 'T00:00:00+03:30').getTime();
  return Math.round((iranTodayStartMs() - eventDayStartMs) / 86400000);
}
