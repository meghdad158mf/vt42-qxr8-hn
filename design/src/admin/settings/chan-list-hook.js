// فهرست «مدیریت منابع» بعد از تغییر موضوع/منطقه، حذف منبع یا افزودن از «پیشنهاد منبع» دوباره ساخته بشه؛
// channels.js خودش رو ثبت می‌کنه تا taxonomy/delete-channel/crawl مستقیم importش نکنن (بدون import دوطرفه)
let RENDER = null;
export function onChanListRender(fn){ RENDER = fn; }
export function refreshChanList(){ if(RENDER) RENDER(); }
