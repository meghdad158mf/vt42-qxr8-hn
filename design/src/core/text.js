// متن: escape برای innerHTML، لینک امن، ارقام فارسی، تشخیص زبان متن
// ⚠️ هر متن بیرونی (پست، عنوان، نام کانال، خروجی هوش مصنوعی، ورودی مدیر) قبل از innerHTML
// از escHtml/escAttr رد می‌شه، متن پست‌ها فقط از claimsTextDisplay و لینک‌ها فقط از safeUrl.

// هر متنی که از بیرون میاد (پست کانال‌ها، RSS، هوش مصنوعی، ورودی مدیر) قبل
// از نشستن توی innerHTML باید از این دو رد بشه — وگرنه یه منبع می‌تونه کد
// (مثل <img onerror>) بفرسته که روی مرورگر مدیر اجرا بشه و توکنش رو بدزده
export function escAttr(s){
  return String(s==null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// فقط لینک http/https مجازه — نه javascript: و مشابه
export function safeUrl(u){
  u = String(u==null ? '' : u).trim();
  return /^https?:\/\//i.test(u) ? escAttr(u) : '#';
}
// بر خلاف escAttr (مخصوص داخل «attribute)، این یکی برای متنی که مستقیم
// داخل یه تگ HTML (نه attribute) می‌شینه — چون reason توی news_ai_insights
// خروجی هوش مصنوعیه (نه متن دستی مدیر)، احتیاطاً escape می‌شه
export function escHtml(s){
  return escAttr(s);
}
// پست‌های قدیمی‌تر کانال بله ممکنه بین «انتشار توسط:» و اولین رسانه یه
// خط خالی داشته باشن (از قبل توی posts.text ذخیره شده)؛ کالکتور جدید
// دیگه این خط رو تولید نمی‌کنه، ولی برای پست‌های از قبل ذخیره‌شده هم
// همینجا حذفش می‌کنیم تا نیازی به backfill دیتابیس نباشه.
// متن پست: همه‌چیز escape می‌شه، فقط تگ <strong> (که collect_bale.py عمداً
// برای تیترهای ادعاها می‌سازه) دوباره فعال می‌شه
export function claimsTextDisplay(text){
  const t = (text||'').replace(/(انتشار توسط:<\/strong>)\n+/, '$1\n');
  return escHtml(t).replace(/&lt;(\/?)strong&gt;/g, '<$1strong>');
}
export function toFaDigits(n){
  const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  return String(n).replace(/[0-9]/g, d => fa[d]);
}
// عنوان‌هایی که مدیر وارد می‌کنه (مجله، بسته، گزارش مدارس): ارقام لاتین فقط وقتی متن فارسی/عربیه
// فارسی می‌شن («شماره 12» → «شماره ۱۲»)؛ عنوان تمام‌لاتین دست‌نخورده می‌مونه
export function faTitle(s){
  s = s == null ? '' : String(s);
  return /[\u0600-\u06FF]/.test(s) ? toFaDigits(s) : s;
}
export const faNum = n => Number(n).toLocaleString('fa-IR');
export function faDigitsToEn(s){
  const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
  return String(s).replace(/[۰-۹٠-٩]/g, ch => {
    const fi = fa.indexOf(ch); if(fi>-1) return fi;
    const ai = ar.indexOf(ch); if(ai>-1) return ai;
    return ch;
  });
}
export function faDigitsToLatin(s){ return String(s || '').replace(/[۰-۹]/g, d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''); }
// دکمه‌ی «ترجمه به فارسی» فقط برای متن غیرفارسی (انگلیسی/عربی…) — قبلاً زیر همه‌ی خبرهای
// سایت‌ها بود، حتی حوزه‌نیوز و مهر، و زدنش بی‌دلیل هزینه‌ی هوش مصنوعی داشت. فارسی از عربی با
// حروف مخصوص فارسی (پ چ ژ گ) و نیم‌فاصله جدا می‌شه
export function needsTranslation(p){
  const s = (p.title || '') + ' ' + (p.text || '');
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const arabicScript = (s.match(/[\u0600-\u06FF]/g) || []).length;
  if(latin > arabicScript) return true;
  if(!arabicScript) return false;
  // حروف مخصوص فارسی یا نیم‌فاصله = فارسی (حتی اگه با «ي/ك» عربی تایپ شده باشه)
  if(/[پچژگ\u200c]/.test(s)) return false;
  const fa = (s.match(/[کی]/g) || []).length;
  const ar = (s.match(/[يكة]/g) || []).length;
  return ar > fa;
}
