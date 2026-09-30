import json; from flowmark import *
t=json.load(open('out/_text.json'))
d,tl=tail(PEACH,'jt')
bars3=''.join(f'<path class="b b{i}" d="M{x} 182V{y}" stroke="{PEACH}" stroke-width="22" stroke-linecap="round"/>' for i,(x,y) in enumerate([(104,138),(144,102),(184,148)]))
import os
LIGHTV=os.environ.get('V')=='light'
BG='#F4EEE8' if LIGHTV else NAVY
WC=NAVY if LIGHTV else '#fff'
TC='#B5651D' if LIGHTV else PEACH
TILE='<rect class="tile" width="288" height="288" rx="64" fill="'+NAVY+'"/>' if LIGHTV else ''
MS=250 if LIGHTV else 270
GAP=40 if LIGHTV else 30
html=f'''<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>Jarian logo intro</title><style>
html,body{{margin:0;height:100%;background:{BG};overflow:hidden}}
.st{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:{GAP}px}}
svg{{overflow:visible}}
.comet{{transform-box:view-box;transform-origin:144px 144px;animation:spin 1.8s cubic-bezier(.16,.84,.3,1) .15s both}}
@keyframes spin{{from{{transform:rotate(-420deg);opacity:0}}15%{{opacity:1}}to{{transform:rotate(0);opacity:1}}}}
.b{{transform-box:fill-box;transform-origin:50% 100%;animation:rise .7s cubic-bezier(.34,1.56,.64,1) both}}
.b0{{animation-delay:.55s}}.b1{{animation-delay:.7s}}.b2{{animation-delay:.85s}}
@keyframes rise{{from{{transform:scaleY(0)}}to{{transform:scaleY(1)}}}}
.w{{animation:up .8s cubic-bezier(.2,.8,.2,1) 1.35s both}}.tg{{animation:up .8s cubic-bezier(.2,.8,.2,1) 1.65s both}}

.tile{{transform-box:view-box;transform-origin:144px 144px;animation:pop .6s cubic-bezier(.34,1.56,.64,1) 0s both}}
@keyframes pop{{from{{transform:scale(.6);opacity:0}}to{{transform:none;opacity:1}}}}
@keyframes up{{from{{opacity:0;transform:translateY(24px)}}to{{opacity:1;transform:none}}}}
</style></head><body><div class="st">
<svg width="{MS}" height="{MS}" viewBox="0 0 288 288"><defs>{d}</defs>{TILE}<g class="comet">{tl}{head(LIGHT)}</g>{bars3}</svg>
<svg class="w" width="{t['ww']*.62:.0f}" height="{t['wh']*.62:.0f}" viewBox="0 0 {t['ww']:.0f} {t['wh']:.0f}"><path d="{t['word']}" fill="{WC}"/></svg>
<svg class="tg" width="{t['tw']*.62:.0f}" height="{t['th']*.62:.0f}" viewBox="0 0 {t['tw']:.0f} {t['th']:.0f}"><path d="{t['tag']}" fill="{TC}"/></svg>
</div><script>document.addEventListener('click',()=>{{const s=document.querySelector('.st');const c=s.cloneNode(true);s.replaceWith(c)}})</script></body></html>'''
open('out/jarian-logo-intro-sample'+('-light' if LIGHTV else '')+'.html','w').write(html)
