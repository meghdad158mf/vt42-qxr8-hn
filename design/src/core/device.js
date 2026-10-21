// نام کوتاه سیستم‌عامل و مرورگر از user-agent (صفحه‌ی «ورودها» و گزارش خطاهای مرورگر)

// ورودها (migration_035، جدول login_events — فقط مدیر select داره)
export function sysDeviceLabel(ua){
  ua = ua || '';
  if(!ua) return 'نامشخص';
  if(/^python/i.test(ua)) return 'اسکریپت خودکار';
  const os = /iphone|ipad/i.test(ua) ? 'آیفون' : /android/i.test(ua) ? 'اندروید' : /windows/i.test(ua) ? 'ویندوز' : /mac os/i.test(ua) ? 'مک' : /linux/i.test(ua) ? 'لینوکس' : '';
  const br = /edg\//i.test(ua) ? 'Edge' : /opr\//i.test(ua) ? 'Opera' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join('، ') || 'نامشخص';
}

