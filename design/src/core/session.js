// نشست کاربر: توکن و نقش (app_admin | app_viewer) فقط در sessionStorage همین زبانه
// authToken/currentRole خواندنی‌ان (binding زنده‌ی ES module)؛ تغییر فقط با saveSession/clearSession
export let authToken = sessionStorage.getItem('jarian_token') || null;
export let currentRole = sessionStorage.getItem('jarian_role') || null;

export function saveSession(token, role){
  authToken = token; currentRole = role;
  sessionStorage.setItem('jarian_token', authToken);
  sessionStorage.setItem('jarian_role', currentRole);
}
export function clearSession(){
  authToken = null; currentRole = null;
  sessionStorage.removeItem('jarian_token'); sessionStorage.removeItem('jarian_role');
}
