const { chromium } = require('playwright'); const path = require('path');
// مرورگر: PW_CHROMIUM (مثلاً /opt/pw-browsers/chromium) یا مرورگر نصب‌شده‌ی خودِ Playwright
(async()=>{ const b=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}); const p=await b.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1.5});
 await p.goto('file:///'+path.join(process.cwd(),'contents.html').split(path.sep).join('/')); await p.waitForTimeout(800); await p.screenshot({path:'contents.png',fullPage:true}); await b.close(); })();
