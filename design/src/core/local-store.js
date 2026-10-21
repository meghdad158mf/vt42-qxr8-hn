// خواندن/نوشتن JSON در localStorage — خطا (حالت خصوصی، فضای پر) = مقدار پیش‌فرض

export function lsGet(k, def){ try{ const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }catch(e){ return def; } }
export function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

