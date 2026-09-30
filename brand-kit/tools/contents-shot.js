const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const p=await b.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1.5});
 await p.goto('file://'+process.cwd()+'/contents.html'); await p.waitForTimeout(800); await p.screenshot({path:'contents.png',fullPage:true}); await b.close(); })();
