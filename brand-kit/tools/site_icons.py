# آیکون‌های سایت از روی نشان «جریان» (flowmark.py) — خروجی در همین پوشه:
# jarian-mark.svg (نوار بالا/فوتر)، icon.svg (آیکون گرد)، icon-maskable.svg (تمام‌رنگ، ناحیه‌ی امن)
# PNGها (icon-192/512، icon-maskable-512، apple-touch-icon ۱۸۰) با Playwright از روی همین SVGها گرفته می‌شن.
import flowmark as fm
fm.N=48   # تکه‌های کمتر برای دنباله‌ی شهاب = فایل سبک‌تر برای وب
from flowmark import *
def inner_id(mid):
    d,tl=fm.tail(PEACH,mid); return d, f'{tl}{fm.head(LIGHT)}{fm.bars(PEACH)}'
x,y,w,h=BOX
d,b=inner_id('jm'); open('jarian-mark.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}"><defs>{d}</defs>{b}</svg>')
s=512/288; d,b=inner_id('ja')
open('icon.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{d}</defs><rect width="512" height="512" rx="112" fill="{NAVY}"/><g transform="scale({s:.4f})">{b}</g></svg>')
s2=1.35; d,b=inner_id('jk')
open('icon-maskable.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{d}</defs><rect width="512" height="512" fill="{NAVY}"/><g transform="translate({256-144*s2:.1f} {256-138*s2:.1f}) scale({s2})">{b}</g></svg>')
