const { chromium } = require('playwright'); const fs=require('fs');
const K=process.env.K;
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const p=await b.newPage({viewport:{width:512,height:512}});
 for(const n of fs.readFileSync('changed.txt','utf8').trim().split('\n')){
   const svg=fs.readFileSync(`${K}/svg-peach/${n}.svg`,'utf8').replace('<svg ','<svg width="512" height="512" ');
   await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
   await p.screenshot({path:`${K}/png-peach/${n}.png`,omitBackground:true,clip:{x:0,y:0,width:512,height:512}});
 } await b.close(); })();
