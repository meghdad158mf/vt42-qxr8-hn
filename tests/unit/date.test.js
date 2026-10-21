import { describe, it, expect, afterEach, vi } from 'vitest';
import { jalaliToGregorian, jalaliMonthLength, calParts, iranTodayStartMs, tehranDayDiff, matchesTime } from '../../design/src/core/date.js';

const iso = ([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('jalaliToGregorian و jalaliMonthLength (مقایسه با تقویم خودِ Intl)', () => {
  it('هر روزِ ۱۴۰۰ تا ۱۴۱۰', () => {
    let checked = 0;
    for (let jy = 1400; jy <= 1410; jy++) {
      for (let jm = 1; jm <= 12; jm++) {
        const len = jalaliMonthLength(jy, jm);
        for (let jd = 1; jd <= len; jd++) {
          const g = jalaliToGregorian(jy, jm, jd);
          const back = calParts(new Date(iso(g) + 'T12:00:00+03:30'), 'persian');
          expect([back.year, back.month, back.day]).toEqual([jy, jm, jd]);
          checked++;
        }
        // روز بعد از آخرین روز ماه، روز اول ماه بعده
        const next = calParts(new Date(new Date(iso(jalaliToGregorian(jy, jm, len)) + 'T12:00:00+03:30').getTime() + 864e5), 'persian');
        expect(next.day).toBe(1);
      }
    }
    expect(checked).toBeGreaterThan(4000);
  });
  it('نمونه‌های شناخته‌شده', () => {
    expect(jalaliToGregorian(1405, 1, 1)).toEqual([2026, 3, 21]);
    expect(jalaliToGregorian(1405, 7, 28)).toEqual([2026, 10, 20]);
    expect(jalaliMonthLength(1403, 12)).toBe(30); // کبیسه
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });
});

describe('مرز «امروز/دیروز» = نیمه‌شب تهران', () => {
  afterEach(() => vi.useRealTimers());
  const at = (s) => { vi.useFakeTimers(); vi.setSystemTime(new Date(s)); };

  it('iranTodayStartMs', () => {
    at('2026-10-20T10:00:00+03:30');
    expect(iranTodayStartMs()).toBe(new Date('2026-10-20T00:00:00+03:30').getTime());
    // ۰۰:۱۰ تهران = هنوز ۲۰:۴۰ دیروز به وقت UTC — باید همون روزِ تهران حساب بشه
    at('2026-10-20T00:10:00+03:30');
    expect(iranTodayStartMs()).toBe(new Date('2026-10-20T00:00:00+03:30').getTime());
  });
  it('tehranDayDiff', () => {
    at('2026-10-20T00:30:00+03:30');
    expect(tehranDayDiff('2026-10-20T00:05:00+03:30')).toBe(0);
    expect(tehranDayDiff('2026-10-19T23:55:00+03:30')).toBe(1);
    expect(tehranDayDiff('2026-10-19T00:00:00+03:30')).toBe(1);
    expect(tehranDayDiff('2026-10-13T12:00:00Z')).toBe(7);
    expect(tehranDayDiff(null)).toBe(Infinity);
  });
  it('matchesTime (فیلتر زمان فیدها)', () => {
    at('2026-10-20T00:30:00+03:30');
    expect(matchesTime(null, '')).toBe(true);           // «همه»
    expect(matchesTime(null, 'today')).toBe(false);     // بدون تاریخ فقط در «همه»
    expect(matchesTime('2026-10-20T00:05:00+03:30', 'today')).toBe(true);
    expect(matchesTime('2026-10-19T23:55:00+03:30', 'today')).toBe(false);
    expect(matchesTime('2026-10-19T23:55:00+03:30', 'yesterday')).toBe(true);
    expect(matchesTime('2026-10-14T12:00:00+03:30', 'week')).toBe(true);  // ۶ روز پیش
    expect(matchesTime('2026-10-13T12:00:00+03:30', 'week')).toBe(false); // ۷ روز پیش
    expect(matchesTime('2026-10-13T12:00:00+03:30', 'range')).toBe(true); // بازه جدا بررسی می‌شه
  });
});
