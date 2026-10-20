// جست‌وجوی فارسی: یکسان‌سازی حروف/ارقام/نیم‌فاصله برای هر دو طرف (متن و عبارت جست‌وجو)

// جست‌وجوی فارسی: «ي/ك» عربی، «ۀ/ة»، اعراب، کشیده و نیم‌فاصله یکسان‌سازی می‌شن (هر دو طرف:
// متن پست و عبارت جست‌وجو) — وگرنه «كم‌آبي» یا «همسان سازی» هیچ نتیجه‌ای نمی‌داد
export function searchNorm(s){
  return String(s || '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإ]/g, 'ا').replace(/ؤ/g, 'و')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[۰-۹]/g, d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[‌‏‎]/g, ' ').replace(/\s+/g, ' ')
    .trim().toLowerCase();
}
const SEARCH_HAY = new WeakMap();   // متن یکسان‌شده‌ی هر پست (تا هر کلید، کل پست‌ها دوباره پردازش نشن)
export function searchHay(p){
  let h = SEARCH_HAY.get(p);
  if(h === undefined){ h = searchNorm((p.title || '') + ' ' + (p.text || '')); SEARCH_HAY.set(p, h); }
  return h;
}
