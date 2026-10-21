// انتخاب‌گر شمسی بازه‌ی زمانی (سه فهرست روز/ماه/سال برای هر سر بازه)
import { toFaDigits } from '../core/text.js';
import { JALALI_MONTHS, calParts, jalaliToGregorian, jalaliMonthLength } from '../core/date.js';

// انتخاب‌گر شمسی بازه (به‌جای تقویم میلادی مرورگر): سه فهرست روز/ماه/سال برای هر سر بازه؛
// با انتخاب هر کدوم، بقیه از امروز پر می‌شن. newsState.dateFrom/dateTo همون رشته‌ی میلادی
// YYYY-MM-DD می‌مونه تا فیلتر دست نخوره.
export function setupJalaliRange(details, onPick){
  const today = calParts(new Date(), 'persian');
  details.querySelectorAll('.jdate').forEach(box=>{
    const opt = (v, t)=>`<option value="${v}">${t}</option>`;
    let days = opt('', 'روز'), months = opt('', 'ماه'), years = opt('', 'سال');
    for(let d = 1; d <= 31; d++) days += opt(d, toFaDigits(d));
    JALALI_MONTHS.forEach((m, i)=>{ months += opt(i + 1, m); });
    for(let y = today.year; y >= today.year - 2; y--) years += opt(y, toFaDigits(y));
    box.innerHTML = `<select data-part="d" aria-label="روز">${days}</select><select data-part="m" aria-label="ماه">${months}</select><select data-part="y" aria-label="سال">${years}</select>`;
    box.addEventListener('change', ()=>{
      const get = k=>box.querySelector(`select[data-part="${k}"]`);
      // با اولین انتخاب، بخش‌های خالی از امروز پر می‌شن
      if(!get('y').value) get('y').value = today.year;
      if(!get('m').value) get('m').value = today.month;
      if(!get('d').value) get('d').value = today.day;
      const jy = +get('y').value, jm = +get('m').value;
      let jd = +get('d').value;
      const ml = jalaliMonthLength(jy, jm);
      if(jd > ml){ jd = ml; get('d').value = ml; }
      const g = jalaliToGregorian(jy, jm, jd);
      const iso = g[0] + '-' + String(g[1]).padStart(2, '0') + '-' + String(g[2]).padStart(2, '0');
      onPick(box.dataset.which, iso);
    });
  });
}

