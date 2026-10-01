const { chromium } = require('playwright'); const fs=require('fs');
const OUT=process.env.OUT, FPS=30, N=90; fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1.5});
 await p.goto('file://'+process.cwd()+'/out/jarian-logo-intro-sample-light.html');
 await p.addStyleTag({content:'html,body{background:transparent!important}'});
 await p.waitForTimeout(300);
 for(let i=0;i<N;i++){
   await p.evaluate(t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t}), i*1000/FPS);
   await p.screenshot({path:`${OUT}/jarian_logo_intro_${String(i).padStart(5,'0')}.png`,omitBackground:true});
 }
 await b.close(); })();
