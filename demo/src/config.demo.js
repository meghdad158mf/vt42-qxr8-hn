// تنظیمات نسخه‌ی نمایشی: «سوپابیس» = پوشه‌ی sb همین سایت (shim.js به درخواست‌ها جواب می‌دهد
// و فایل‌های بسته‌ها و گزارش‌ها همان‌جا هستند). نشانی و کلید سامانه‌ی واقعی در این نسخه نیست.
export const SUPABASE_URL = new URL('sb', location.href).href;
export const SUPABASE_ANON_KEY = 'demo';
export { APP_VERSION } from '../../design/src/core/config.js';
