const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = process.env.SP + '/kit3/Jarian-Motion-Kit';
const mk = d=>fs.mkdirSync(path.join(OUT,d),{recursive:true});
['01-logo','02-illustrations/png','02-illustrations/webp-original','03-icons/svg-peach','03-icons/svg-white','03-icons/png-peach','04-shapes/svg','04-shapes/png','07-screenshots/desktop-1920x1080','07-screenshots/mobile','08-text'].forEach(mk);
(async()=>{
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  // ---------- mock data for realistic pages ----------
  const names = ['خبرگزاری فارس','تسنیم','مهر','ایرنا','جهان‌نیوز','رجانیوز','مشرق','دانشجو','خبر فوری','صراط','انتخاب','عصر ایران'];
  const channels = names.map((t,i)=>({id:i+1,platform:i%3?'eitaa':'telegram',username:'c'+i,title:t,active:true,show_in_news:true,show_in_cyberspace:i<6,show_in_people:i>6}));
  channels.push({id:50,platform:'bale',username:'rasadfakenews',title:'رصد شایعات',active:true,show_in_news:true});
  const H = h=>new Date(Date.now()-h*3600e3).toISOString();
  let id=1; const posts=[];
  const waveA='رهبر معظم انقلاب اسلامی صبح امروز در دیدار جمعی از فرماندهان نیروی هوایی ارتش بر ضرورت تقویت توان دفاعی کشور و پرهیز از هرگونه غفلت در برابر تهدیدهای دشمن تأکید کردند';
  for(let c=1;c<=8;c++) posts.push({id:id++,channel_id:c,platform:'eitaa',text:waveA,posted_at:H(0.5+c*0.3),scraped_at:H(0.4+c*0.3)});
  const waveB='سخنگوی دولت اعلام کرد قیمت بنزین در سال آینده تغییر نمی‌کند و شایعات منتشرشده در فضای مجازی درباره سهمیه‌بندی جدید صحت ندارد';
  for(let c=3;c<=9;c++) posts.push({id:id++,channel_id:c,platform:'eitaa',text:waveB,posted_at:H(5+c*0.2),scraped_at:H(5+c*0.2)});
  let seed=5; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
  const V='دولت مجلس بازار ارز طلا بورس نفت مدرسه دانشگاه شهر استان دادگاه انتخابات سفر تحریم قیمت مسکن بانک کارگر'.split(' ');
  for(let k=0;k<400;k++){ const w=[]; for(let j=0;j<20;j++) w.push(V[Math.floor(r()*V.length)]); const h=Math.pow(r(),1.3)*23; posts.push({id:id++,channel_id:1+Math.floor(r()*12),platform:'eitaa',text:w.join(' '),posted_at:H(h),scraped_at:H(h)}); }
  ['ادعای افزایش قیمت نان از هفته آینده در مشهد صحت ندارد','ویدیوی منتشرشده از تجمع در میدان شهدا مربوط به سال‌های گذشته است','خبر تعطیلی مدارس خراسان رضوی به دلیل آلودگی هوا تکذیب شد'].forEach((t,k)=>posts.push({id:id++,channel_id:50,platform:'bale',title:t,text:t,posted_at:H(1+k*3),scraped_at:H(1+k*3)}));
  const sel=[[['نارضایتی معیشتی','تصمیم کلان حاکمیتی'],12,'مجلس شورای اسلامی طرح اصلاح قانون مالیات بر ارزش افزوده را تصویب و برای تأیید به شورای نگهبان فرستاد.'],
   [['دیپلماسی'],9,'سخنگوی وزارت امور خارجه از سفر هیئت ایرانی به وین برای دور تازه‌ی مذاکرات خبر داد.'],
   [['حوزه و روحانیت'],6,'تولیت آستان قدس رضوی در دیدار طلاب حوزه علمیه خراسان بر نقش حوزه در پاسخ به شبهات فکری جوانان تأکید کرد.'],
   [['امنیت ملی','تهدید خارجی'],4,'نیروی زمینی سپاه رزمایش بزرگ پیامبر اعظم را در منطقه‌ی شمال غرب کشور آغاز کرد.'],
   [['آب و محیط زیست','خراسان و مشهد'],2,'مدیرعامل آبفای مشهد از کاهش ۴۰ درصدی ذخایر سدهای تأمین‌کننده‌ی آب شهر خبر داد.']];
  const insight={id:1,computed_at:H(0.8),window_hours:6,topics:[{name:'سیاست داخلی',weight:34},{name:'اقتصاد',weight:22},{name:'مذاکرات',weight:15},{name:'حوزه علمیه',weight:9},{name:'حوادث',weight:7}],
    selected_posts:sel.map(([tags,src,hl],k)=>({id:900000+k,headline:hl,score:9-k,tags,sources:src,posts:src,channel_id:k+1,time:H(k*0.7+0.5)}))};
  const setup = async (ctx)=>{
    await ctx.route('**/komqnapfqrtxxaytpcdt.supabase.co/**', route=>{
      const url = decodeURIComponent(route.request().url()); const t=(url.match(/\/rest\/v1\/([a-z_]+)/)||[])[1];
      let body=[]; if(t==='channels') body=channels; if(t==='news_ai_insights') body=[insight];
      if(t==='magazines') body=Array.from({length:5},(_,i)=>({id:i+1,title:'بسته تحلیلی جریان — شماره '+(5-i),sort_order:i}));
      if(t==='posts'){ if(url.includes('scraped_at=lt.')||url.includes('hawza_relevant')) body=[]; else if(url.includes('platform=eq.bale')) body=posts.filter(p=>p.platform==='bale'); else body=posts; }
      route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/12480','access-control-expose-headers':'content-range'},body:JSON.stringify(body)});
    });
    await ctx.route('**/functions/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  };
  const openApp = async (W,Hh,dpr)=>{
    const ctx = await browser.newContext({ serviceWorkers:'block', viewport:{width:W,height:Hh}, deviceScaleFactor:dpr||1 });
    await setup(ctx); const page = await ctx.newPage();
    await page.goto('http://localhost:8765/ita-monitoring-prototype.html');
    await page.evaluate(()=>{ sessionStorage.setItem('jarian_token','x'); sessionStorage.setItem('jarian_role','app_viewer'); localStorage.setItem('jarian_intro_seen','1'); });
    await page.reload(); await page.waitForTimeout(2500);
    await page.addStyleTag({content:'#ann-bar,#to-top{display:none!important}'});
    return {ctx,page};
  };
  const shot = async (W,Hh,dpr,dir,list)=>{
    const {ctx, page} = await openApp(W,Hh,dpr);
    await page.addStyleTag({content:'*{transition:none!important}'});
    for(const [name, fn] of list){
      await page.evaluate(fn); await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/07-screenshots/${dir}/${name}.png` });
    }
    return ctx;
  };
  const toEl = sel=>`(()=>{ const e=document.querySelector('${sel}'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 40); })()`;
  const desktop = [
    ['01-home-hero', `switchSection('dashboard'); window.scrollTo(0,0)`],
    ['02-home-date-and-domains', toEl('#datebar')],
    ['03-home-domains', toEl('.domain-grid')],
    ['04-home-why-jarian', toEl('.why-jarian, [class*="why-jarian"]')],
    ['05-home-analysis-package', toEl('.pkg-flow')],
    ['06-news-at-a-glance', `goToNewsTab('analytics'); window.scrollTo(0,0)`],
    ['07-news-waves-and-charts', toEl('#news-waves-panel')],
    ['08-news-social-feed', `goToNewsTab('study'); window.scrollTo(0,0)`],
    ['09-news-claims', `goToNewsTab('claims'); window.scrollTo(0,0)`],
    ['10-cyberspace-posts', `switchSection('posts'); window.scrollTo(0,0)`],
    ['11-notes-figures', `goToPeopleTab('figures'); window.scrollTo(0,0)`],
  ];
  const c1 = await shot(1920,1080,1,'desktop-1920x1080',desktop); await c1.close();
  const mobile = [
    ['01-home-hero', `switchSection('dashboard'); window.scrollTo(0,0)`],
    ['02-home-domains', toEl('.domain-grid')],
    ['03-news-at-a-glance', `goToNewsTab('analytics'); window.scrollTo(0,0)`],
  ];
  const c2 = await shot(390,844,3,'mobile',mobile); await c2.close();
  console.log('screens done');
  await browser.close();
})();
