import os, sys
sys.path.insert(0,'.'); from flowmark import *
sys.path.insert(0,os.environ['LK'])
K=os.environ['K']; OUT=os.environ['OUT']
for d in ('','/layers','/lockups/svg'): os.makedirs(OUT+d,exist_ok=True)
lst=[]
def save(path,svg,w,h,scale): open(OUT+'/'+path,'w').write(svg); lst.append(f'{path} {w} {h} {scale}')
def sv(vb,body,defs=''): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><defs>{defs}</defs>{body}</svg>'
# ---- نشان‌ها ----
x,y,w,h=BOX
for sch,name in (('peach','on-dark'),('white','white'),('navy','navy')):
    d,b=inner(sch); save(f'jarian-mark-{name}.svg',sv(f'{x} {y} {w} {h}',b,d),w,h,1024/h)
d,b=inner('peach'); save('jarian-app-icon.svg',sv('0 0 288 288',f'<rect width="288" height="288" rx="64" fill="{NAVY}"/>'+b,d),288,288,1024/288)
# ---- لایه‌ها برای انیمیشن (همه روی یک بوم ۲۸۸؛ مرکز چرخش شهاب = وسط بوم) ----
d,tl=tail(PEACH,'jt')
save('layers/layer-1-comet-tail.svg',sv('0 0 288 288',tl,d),288,288,2048/288)
save('layers/layer-2-comet-head.svg',sv('0 0 288 288',head(LIGHT)),288,288,2048/288)
save('layers/layer-3-bars.svg',sv('0 0 288 288',bars(PEACH)),288,288,2048/288)
save('layers/layer-0-background-tile.svg',sv('0 0 288 288',f'<rect width="288" height="288" rx="64" fill="{NAVY}"/>'),288,288,2048/288)
# ---- لوگوی کامل عمودی/افقی ----
from build_text import text_path
FB=f'{K}/06-fonts/IRANSansX-ExtraBold.ttf'; FM=f'{K}/06-fonts/IRANSansX-Medium.ttf'
word,ww,wh,_=text_path(FB,'جریان',200); tag,tw,th,_=text_path(FM,'رصد و تحلیل فضای سیاسی‌اجتماعی',44)
V={'on-dark':('#FFFFFF',PEACH,'peach',False),'on-light':(NAVY,'#B5651D','peach',True),'white':('#FFFFFF','#FFFFFF','white',False),'navy':(NAVY,NAVY,'navy',False)}
def mark_at(X,Y,S,sch,tile):
    d,b=inner(sch)
    if tile:  # نشان داخل مربع سرمه‌ای، S = ضلع مربع
        return d,f'<g transform="translate({X:.1f} {Y:.1f}) scale({S/288:.4f})"><rect width="288" height="288" rx="64" fill="{NAVY}"/>{b}</g>',S,S
    s=S/h; return d,f'<g transform="translate({X-x*s:.1f} {Y-y*s:.1f}) scale({s:.4f})">{b}</g>',w*s,S
for vn,(wc,tc,sch,tile) in V.items():
    for wt in (True,False):
        suf='' if wt else '-no-tagline'
        # عمودی
        MS=380 if tile else 400; pad=60; gap=44
        mw=MS if tile else w*MS/h
        Wd=max(ww,tw if wt else 0,mw)+2*pad; Hd=pad+MS+gap+wh+(40+th if wt else 0)+pad
        d,g,_,_=mark_at((Wd-mw)/2,pad,MS,sch,tile); yy=pad+MS+gap
        body=g+f'<path transform="translate({(Wd-ww)/2:.1f} {yy:.1f})" d="{word}" fill="{wc}"/>'
        if wt: body+=f'<path transform="translate({(Wd-tw)/2:.1f} {yy+wh+40:.1f})" d="{tag}" fill="{tc}"/>'
        save(f'lockups/svg/jarian-logo-vertical-{vn}{suf}.svg',sv(f'0 0 {Wd:.0f} {Hd:.0f}',body,d),round(Wd),round(Hd),2)
        # افقی (نشان راست)
        MS2=290 if tile else 320; pad2=44; gap2=48
        mw2=MS2 if tile else w*MS2/h
        tbw=max(ww,tw if wt else 0); tbh=wh+(28+th if wt else 0)
        Wh=pad2+tbw+gap2+mw2+pad2; Hh=max(MS2,tbh)+2*pad2
        mx=Wh-pad2-mw2; d,g,_,_=mark_at(mx,(Hh-MS2)/2,MS2,sch,tile)
        tr=mx-gap2; ty=(Hh-tbh)/2
        body=g+f'<path transform="translate({tr-ww:.1f} {ty:.1f})" d="{word}" fill="{wc}"/>'
        if wt: body+=f'<path transform="translate({tr-tw:.1f} {ty+wh+28:.1f})" d="{tag}" fill="{tc}"/>'
        save(f'lockups/svg/jarian-logo-horizontal-{vn}{suf}.svg',sv(f'0 0 {Wh:.0f} {Hh:.0f}',body,d),round(Wh),round(Hh),2)
open(OUT+'/_list.txt','w').write('\n'.join(lst)); print(len(lst),'files')
open(OUT+'/_text.json','w').write(__import__('json').dumps({'word':word,'ww':ww,'wh':wh,'tag':tag,'tw':tw,'th':th}))
