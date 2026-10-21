// کارهایی که بخش‌های بیننده از بخش مدیریت می‌خوان، بدون import مستقیم از admin/ (تا کد مدیریت در بسته‌ی
// جدای مدیر بمونه). admin/ هر کار رو با setAdminHook ثبت می‌کنه؛ برای بیننده هیچ‌کدوم ثبت نشده و adminHook هیچ کاری نمی‌کنه.
const HOOKS = {};
export function setAdminHook(name, fn){ HOOKS[name] = fn; }
export function adminHook(name, ...args){
  const fn = HOOKS[name];
  return fn ? fn(...args) : undefined;
}

// خودِ بسته‌ی مدیریت (admin/admin.js) بعد از بار شدن پویا؛ برای بیننده null می‌مونه
let ADMIN = null;
export function setAdmin(mod){ ADMIN = mod; }
export function admin(){ return ADMIN; }
