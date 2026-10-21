import { describe, it, expect } from 'vitest';
import { nidValid, normalizeIrMobile } from '../../design/src/core/validate.js';

describe('nidValid (هم‌سو با nid_valid سمت سرور)', () => {
  it('کد ملی معتبر', () => {
    for (const n of ['0013542419', '0499370899', '0084575948']) expect(nidValid(n)).toBe(true);
  });
  it('رقم کنترل اشتباه', () => {
    expect(nidValid('0013542418')).toBe(false);
    expect(nidValid('0499370898')).toBe(false);
  });
  it('ده رقم یکسان و طول نادرست', () => {
    expect(nidValid('1111111111')).toBe(false);
    expect(nidValid('0000000000')).toBe(false);
    expect(nidValid('001354241')).toBe(false);
    expect(nidValid('00135424190')).toBe(false);
    expect(nidValid('00135a2419')).toBe(false);
  });
  it('هر دو شاخه‌ی رقم کنترل: باقی‌مانده‌ی کمتر از ۲ و بیشتر', () => {
    // مجموع وزن‌دار = رقم‌ها × (۱۰ تا ۲)؛ باقی‌مانده‌ی ۱۰ → کنترل ۱، ۲ → ۹، ۱ → ۱
    expect(nidValid('1000000001')).toBe(true); // ۱×۱۰ = ۱۰
    expect(nidValid('0000000019')).toBe(true); // ۱×۲ = ۲
    expect(nidValid('0000000061')).toBe(true); // ۶×۲ = ۱۲ ← باقی‌مانده ۱
    expect(nidValid('0000000062')).toBe(false);
  });
});

describe('normalizeIrMobile', () => {
  it('قالب‌های رایج به 09xxxxxxxxx', () => {
    for (const v of ['09121234567', '0912 123 4567', '0912-123-4567', '(0912) 1234567', '+989121234567', '00989121234567', '989121234567', '9121234567', '۰۹۱۲۱۲۳۴۵۶۷', '٠٩١٢١٢٣٤٥٦٧']) {
      expect(normalizeIrMobile(v)).toBe('09121234567');
    }
  });
  it('ورودی نامعتبر دست‌نخورده (فقط ارقام) برمی‌گردد تا فرم خطا بدهد', () => {
    expect(normalizeIrMobile('123')).toBe('123');
    expect(normalizeIrMobile('')).toBe('');
  });
});
