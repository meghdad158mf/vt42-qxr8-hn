import { describe, it, expect } from 'vitest';
import { escAttr, escHtml, safeUrl, claimsTextDisplay, toFaDigits, faTitle, faDigitsToEn, faDigitsToLatin, needsTranslation } from '../../design/src/core/text.js';

describe('escAttr / escHtml', () => {
  it('هر پنج نویسه‌ی خطرناک را escape می‌کند', () => {
    expect(escAttr(`<img src=x onerror="alert('x')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
    expect(escHtml('<b>')).toBe('&lt;b&gt;');
  });
  it('null و undefined رشته‌ی خالی می‌شوند', () => {
    expect(escAttr(null)).toBe('');
    expect(escAttr(undefined)).toBe('');
    expect(escAttr(0)).toBe('0');
  });
});

describe('safeUrl', () => {
  it('فقط http و https', () => {
    expect(safeUrl('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&amp;c=2');
    expect(safeUrl('  HTTP://x.ir ')).toBe('HTTP://x.ir');
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<b>', '//evil.com', 'vbscript:x', '', null]) {
      expect(safeUrl(bad)).toBe('#');
    }
  });
  it('کوتیشن داخل آدرس از attribute بیرون نمی‌زند', () => {
    expect(safeUrl('https://x.ir/"onmouseover="alert(1)')).not.toContain('"');
  });
});

describe('claimsTextDisplay', () => {
  it('فقط <strong> دوباره فعال می‌شود', () => {
    const out = claimsTextDisplay('<strong>ادعا:</strong> متن <img src=x onerror=alert(1)><script>x</script>');
    expect(out).toContain('<strong>ادعا:</strong>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
  });
  it('خط خالی بعد از «انتشار توسط:» حذف می‌شود', () => {
    expect(claimsTextDisplay('<strong>انتشار توسط:</strong>\n\n\nمنبع')).toBe('<strong>انتشار توسط:</strong>\nمنبع');
  });
});

describe('ارقام', () => {
  it('toFaDigits', () => expect(toFaDigits('شماره 1405/7/28')).toBe('شماره ۱۴۰۵/۷/۲۸'));
  it('faTitle فقط متن فارسی را فارسی‌رقم می‌کند', () => {
    expect(faTitle('شماره 12')).toBe('شماره ۱۲');
    expect(faTitle('Report 12')).toBe('Report 12');
    expect(faTitle(null)).toBe('');
  });
  it('faDigitsToEn و faDigitsToLatin', () => {
    expect(faDigitsToEn('۰۹۱۲-٣٤٥')).toBe('0912-345');
    expect(faDigitsToLatin('کد: ۱۲ ٣4')).toBe('1234');
  });
});

describe('needsTranslation', () => {
  it('فارسی ترجمه نمی‌خواهد، حتی با ي/ك عربی', () => {
    expect(needsTranslation({ title: 'نشست خبری', text: 'سخنگوی دولت گفت' })).toBe(false);
    expect(needsTranslation({ text: 'پيام رهبر انقلاب به كنگره' })).toBe(false);
  });
  it('انگلیسی و عربی ترجمه می‌خواهند', () => {
    expect(needsTranslation({ title: 'Iran nuclear talks resume', text: '' })).toBe(true);
    expect(needsTranslation({ text: 'قال المتحدث باسم الحكومة إن المفاوضات مستمرة' })).toBe(true);
  });
  it('متن خالی ترجمه نمی‌خواهد', () => expect(needsTranslation({})).toBe(false));
});
