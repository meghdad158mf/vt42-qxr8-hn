# نشان «جریان» — مدار باز با شهاب باریک‌شونده + سه ستون (بوم ۲۸۸، مرکز چرخش ۱۴۴،۱۴۴)
import math
PEACH='#EAB393'; LIGHT='#F3CDB4'; NAVY='#16202A'
C=144; R=92; HEAD=250; SPAN=300; W=13; N=90
def _pt(a, r=R): t=math.radians(a); return C+r*math.cos(t), C+r*math.sin(t)
def tail_mask(mid):
    """ماسک خاکستری دنباله: تکه‌های پشت‌سرهم با رنگ مات (هم‌پوشانی راه‌راه نمی‌شه) → شفافیت واقعی"""
    segs=[]
    for i in range(N):
        f0,f1,fm=i/N,min(1,(i+1.3)/N),(i+.65)/N
        p0,p1,pm=_pt(HEAD-SPAN*(1-f0)),_pt(HEAD-SPAN*(1-f1)),_pt(HEAD-SPAN*(1-fm))
        g=round(255*((i+1)/N)**1.6); ww=W*(.3+.7*fm)
        segs.append(f'<path d="M{p0[0]:.2f} {p0[1]:.2f}Q{2*pm[0]-(p0[0]+p1[0])/2:.2f} {2*pm[1]-(p0[1]+p1[1])/2:.2f} {p1[0]:.2f} {p1[1]:.2f}" stroke="rgb({g},{g},{g})" stroke-width="{ww:.2f}" stroke-linecap="round" fill="none"/>')
    return f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="288" height="288"><rect width="288" height="288" fill="#000"/>{"".join(segs)}</mask>'
HX,HY=_pt(HEAD)
def tail(col, mid): return tail_mask(mid), f'<rect width="288" height="288" fill="{col}" mask="url(#{mid})"/>'
def head(col, glow=True):
    hr=W*1.25
    return (f'<circle cx="{HX:.2f}" cy="{HY:.2f}" r="{hr*1.8:.2f}" fill="{col}" fill-opacity=".18"/>' if glow else '')+f'<circle cx="{HX:.2f}" cy="{HY:.2f}" r="{hr:.2f}" fill="{col}"/>'
def bars(col): return f'<path d="M104 182V138M144 182V102M184 182V148" stroke="{col}" stroke-width="22" stroke-linecap="round" fill="none"/>'
# رنگ‌بندی: (دنباله، ستون‌ها، سر شهاب)
SCHEMES={'peach':(PEACH,PEACH,LIGHT),'white':('#FFFFFF','#FFFFFF','#FFFFFF'),'navy':(NAVY,NAVY,NAVY)}
def inner(scheme, mid='jt'):
    t,b,h=SCHEMES[scheme]; d,tl=tail(t,mid)
    return d, f'<g class="comet">{tl}{head(h)}</g><g class="bars">{bars(b)}</g>'
BOX=(40,24,208,224)  # کادر محتوای نشان بدون زمینه (x,y,w,h)
