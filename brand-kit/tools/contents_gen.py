import os
K=os.environ['K']; F=lambda p:'file://'+K+'/'+p
fa=lambda n:str(n).translate(str.maketrans('0123456789','۰۱۲۳۴۵۶۷۸۹'))
cnt=lambda d:sum(len(f) for _,_,f in os.walk(K+'/'+d))
icons=sorted(os.listdir(K+'/03-icons/svg-peach'))[:21]
cards=[
 ('01-logo','لوگو',[
   'نشان «مدار و شهاب» (همان لوگوی سایت) در ۴ رنگ‌بندی',
   'لوگوی کامل عمودی و افقی — ۱۶ حالت',
   'لایه‌های جدا برای انیمیشن',
   'موشن لوگو برای زمینه‌ی تیره و روشن (فریم شفاف Full HD + فیلم)',
   'آیکون قبلی سایت (مرجع)'],
  f'''<div class="row"><img src="{F('01-logo/lockups/png/jarian-logo-vertical-on-dark.png')}" style="height:180px">
   <div class="col"><img src="{F('01-logo/lockups/png/jarian-logo-horizontal-on-light.png')}" style="height:54px;background:#F4EEE8;border-radius:10px;padding:8px 12px">
   <img src="{F('01-logo/lockups/png/jarian-logo-horizontal-white.png')}" style="height:54px;padding:8px 12px"></div></div>'''),
 ('02-illustrations','تصویرها',['تصویر اصلی صفحه‌ی نخست','۵ آیکون سه‌بعدی عرصه‌ها','تصویر تحلیل و لوگوی بصیرت','PNG شفاف + فایل اصلی WebP'],
  f'''<div class="row"><img src="{F('02-illustrations/png/dashboard-hero.png')}" style="height:160px">'''+''.join(f'<img src="{F("02-illustrations/png/domain-icon-"+n+".png")}" style="height:62px">' for n in ('news','hawza'))+'</div>'),
 ('03-icons','آیکون‌های خطی',['۳۴ آیکون سایت: آمار، ۱۰ بخش بسته، تب‌ها','رنگ هلویی و سفید (SVG)','PNG هلویی ۵۱۲ پیکسل'],
  '<div class="ic">'+''.join(f'<div><img src="{F("03-icons/svg-peach/"+i)}"></div>' for i in icons)+'</div>'),
 ('04-shapes','اجزای تزئینی',['قوس‌های مدار صفحه‌ی نخست','شهاب نورانی و نقطه‌های ایستگاه','خط تزئینی ستاره‌دار'],
  f'''<div class="col" style="gap:6px"><img src="{F('04-shapes/png/orbit-domains-arc-clean.png')}" style="width:92%"><img src="{F('04-shapes/png/meteor-streak.png')}" style="width:70%"><img src="{F('04-shapes/png/divider-ornament.png')}" style="width:92%"></div>'''),
 ('05-colors','پالت رنگ',['۱۵ رنگ واقعی سایت + گرادیان‌ها و رنگ‌های وضعیت','فایل ASE برای ایلاستریتور، فتوشاپ و افتر افکت'],
  '<div class="sw">'+''.join(f'<div style="background:{c}"><span style="color:{"#16202A" if c in ("#FFFFFF","#FFFAF5","#F1C4A8","#EAB393") else "#fff"}">{c}</span></div>' for c in ['#16202A','#24323F','#EAB393','#B5651D','#F1C4A8','#FFFAF5','#0E9968','#D9433C'])+'</div>'),
 ('06-fonts','فونت',['IRANSansX — فونت سایت','Regular، Medium، Bold، ExtraBold + Variable','⚠️ فونت تجاری؛ برای انتشار مجوز لازم است'],
  '<div class="fonts">'+''.join(f'<span style="font-family:F{w}">جریان</span>' for w in ('R','M','B','X'))+'<div class="fw"><span>Regular</span><span>Medium</span><span>Bold</span><span>ExtraBold</span></div></div>'),
 ('07-screenshots','تصویر صفحه‌های سایت',['۱۱ تصویر رایانه ۱۹۲۰×۱۰۸۰ (ویرایش ۵.۲۱.۰)','۳ تصویر گوشی با کیفیت بالا','برای مرجع و استفاده در ویدئو'],
  f'''<div class="row"><img src="{F('07-screenshots/desktop-1920x1080/01-home-hero.png')}" class="shot" style="height:150px"><img src="{F('07-screenshots/mobile/01-home-hero.png')}" class="shot" style="height:170px"></div>'''),
 ('08-text','متن‌ها',['نام، شعار و متن‌های سایت','عرصه‌ها، «چرا جریان»، بسته‌ی تحلیلی','آماده‌ی کپی در موشن'],
  '<div class="txt"><b>سامانه هوشمند جریان</b><span>نبض <i>فضای سیاسی اجتماعی</i></span><span>به روایت حوزه علمیه خراسان</span></div>'),
 ('README-FA.txt','راهنمای فارسی',['توضیح هر پوشه و هر فایل','کدام لوگو برای کدام زمینه','نکته‌های حرکت و رنگ'],
  '<div class="readme"><div class="doc"><i></i><i></i><i style="width:60%"></i><i></i><i style="width:75%"></i></div></div>'),
]
def card(folder,title,bul,thumb):
    n=cnt(folder) if not folder.endswith('.txt') else 1
    num=folder[:2] if folder[:2].isdigit() else '—'
    return f'''<div class="card"><div class="hd"><span class="num">{fa(num)}</span><div><div class="t">{title}</div><div class="f">{folder}</div></div><span class="c">{fa(n)} فایل</span></div>
    <div class="th">{thumb}</div><ul>{''.join(f'<li>{b}</li>' for b in bul)}</ul></div>'''
total=sum(len(f) for _,_,f in os.walk(K))
ff=lambda n,f:f"@font-face{{font-family:{n};src:url({F('06-fonts/'+f)})}}"
html=f'''<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
{ff('FR','IRANSansX-Regular.ttf')}{ff('FM','IRANSansX-Medium.ttf')}{ff('FB','IRANSansX-Bold.ttf')}{ff('FX','IRANSansX-ExtraBold.ttf')}
*{{box-sizing:border-box}}body{{margin:0;width:1600px;background:#16202A;color:#fff;font-family:FM;padding:56px}}
.top{{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}}
h1{{font-family:FX;font-size:44px;margin:0}}h1 span{{color:#EAB393}}
.sub{{color:rgba(255,255,255,.6);font-size:18px;margin-top:8px}}
.orn{{height:1px;background:linear-gradient(90deg,transparent,#EAB393 50%,transparent);opacity:.5;margin:30px 0 34px}}
.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}}
.card{{background:#1A222B;border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:22px 24px 18px;display:flex;flex-direction:column}}
.hd{{display:flex;align-items:center;gap:14px}}.num{{width:46px;height:46px;border-radius:13px;background:#EAB393;color:#16202A;font-family:FX;font-size:20px;display:flex;align-items:center;justify-content:center;flex:none}}
.t{{font-family:FX;font-size:23px}}.f{{direction:ltr;text-align:right;font-family:monospace;font-size:13px;color:rgba(255,255,255,.45);margin-top:2px}}
.c{{margin-inline-start:auto;font-size:14px;color:#EAB393;background:rgba(234,179,147,.12);padding:5px 12px;border-radius:99px;white-space:nowrap}}
.th{{height:210px;margin:18px 0 14px;border-radius:16px;background:#16202A;display:flex;align-items:center;justify-content:center;overflow:hidden}}
.row{{display:flex;align-items:center;justify-content:center;gap:14px}}.col{{display:flex;flex-direction:column;align-items:center;gap:10px}}
ul{{margin:0;padding:0 18px 0 0;font-size:16px;line-height:1.85;color:rgba(255,255,255,.82)}}li::marker{{color:#EAB393}}
.ic{{display:grid;grid-template-columns:repeat(7,1fr);gap:12px 16px}}.ic div{{width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center}}.ic img{{width:24px;height:24px}}
.sw{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:88%}}.sw div{{height:78px;border-radius:12px;border:1px solid rgba(255,255,255,.12);display:flex;align-items:flex-end;padding:6px 8px}}.sw span{{font:12px monospace;direction:ltr}}
.fonts{{display:grid;grid-template-columns:repeat(4,1fr);width:92%;text-align:center;font-size:32px;row-gap:10px}}.fw{{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);font:13px monospace;color:rgba(255,255,255,.45)}}
.shot{{border-radius:8px;border:1px solid rgba(255,255,255,.15)}}
.txt{{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:22px}}.txt b{{font-family:FX;font-size:30px;font-weight:normal}}.txt i{{font-style:normal;color:#EAB393}}.txt span:last-child{{font-size:17px;color:rgba(255,255,255,.6)}}
.doc{{width:120px;height:150px;border-radius:12px;background:#F4EEE8;padding:26px 18px;display:flex;flex-direction:column;gap:12px;position:relative}}.doc i{{height:7px;border-radius:4px;background:#B5651D;opacity:.55;display:block}}.doc i:first-child{{background:#16202A;opacity:.85;width:70%}}
.foot{{display:flex;justify-content:space-between;align-items:center;margin-top:34px;color:rgba(255,255,255,.5);font-size:15px}}.foot b{{color:#EAB393;font-weight:normal}}
</style></head><body>
<div class="top"><div><h1>بسته گرافیکی <span>سامانه جریان</span></h1><div class="sub">همه‌ی فایل‌های نهایی گرافیکی و لوگو — برای موشن‌گرافی، چاپ و شبکه‌های اجتماعی</div></div>
<img src="{F('01-logo/lockups/png/jarian-logo-horizontal-on-dark.png')}" style="height:96px"></div>
<div class="orn"></div><div class="grid">{''.join(card(*c) for c in cards)}</div>
<div class="foot"><span>همه‌ی PNGها با پس‌زمینه‌ی شفاف — SVGها برداری و بدون افت کیفیت</span><span>مجموع: <b>{fa(total)} فایل</b> در ۸ پوشه</span></div>
</body></html>'''
open('contents.html','w').write(html)
