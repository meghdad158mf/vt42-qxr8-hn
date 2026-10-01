const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:'vid',size:{width:1280,height:720}}});
 const p=await ctx.newPage(); await p.goto('file://'+process.cwd()+'/out/jarian-logo-intro-sample.html');
 await p.waitForTimeout(900); await p.screenshot({path:'f1.png'}); await p.waitForTimeout(3600); await p.screenshot({path:'f2.png'});
 await ctx.close(); await b.close(); })();
