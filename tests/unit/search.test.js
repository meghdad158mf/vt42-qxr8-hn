import { describe, it, expect } from 'vitest';
import { searchNorm, searchHay } from '../../design/src/core/search.js';

describe('searchNorm', () => {
  it('حروف عربی و فارسی یکسان می‌شوند', () => {
    expect(searchNorm('كم‌آبي')).toBe(searchNorm('کم آبی'));
    expect(searchNorm('خانۀ ملت')).toBe('خانه ملت');
    expect(searchNorm('مدرسة')).toBe('مدرسه');
    expect(searchNorm('أحمد إسلام مؤمن')).toBe('احمد اسلام مومن');
  });
  it('اعراب و کشیده حذف می‌شوند', () => {
    expect(searchNorm('مُحَمَّد')).toBe('محمد');
    expect(searchNorm('ســلام')).toBe('سلام');
  });
  it('نیم‌فاصله فاصله می‌شود و فاصله‌های پشت‌سرهم یکی', () => {
    expect(searchNorm('همسان‌سازی')).toBe('همسان سازی');
    expect(searchNorm('  الف   ب  ')).toBe('الف ب');
  });
  it('ارقام فارسی و عربی لاتین و حروف لاتین کوچک می‌شوند', () => {
    expect(searchNorm('۱۴۰۵ و ٢٠٢٦ Iran')).toBe('1405 و 2026 iran');
  });
  it('ورودی خالی', () => {
    expect(searchNorm(null)).toBe('');
    expect(searchNorm(undefined)).toBe('');
  });
});

describe('searchHay', () => {
  it('عنوان و متن را با هم یکسان‌سازی و برای هر پست کش می‌کند', () => {
    const p = { title: 'خبر', text: 'كشور' };
    expect(searchHay(p)).toBe('خبر کشور');
    p.text = 'تغییر';
    expect(searchHay(p)).toBe('خبر کشور');
  });
});
