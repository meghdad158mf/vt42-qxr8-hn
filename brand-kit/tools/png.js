const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const O=process.env.O;
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const p=await b.newPage();
 for(const line of fs.readFileSync(O+'/_list.txt','utf8').trim().split('\n')){
   const [f,w,h,s]=line.split(' '); const W=Math.round(+w*+s), H=Math.round(+h*+s);
   await p.setViewportSize({width:W,height:H});
   const svg=fs.readFileSync(O+'/'+f,'utf8').replace('<svg ',`<svg width="${W}" height="${H}" `);
   await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
   let out=O+'/'+f.replace('/svg/','/png/').replace('.svg', f.includes('lockups')?'.png':'-'+Math.round(Math.max(W,H))+'.png');
   fs.mkdirSync(path.dirname(out),{recursive:true});
   await p.screenshot({path:out,omitBackground:true,clip:{x:0,y:0,width:W,height:H}});
 } await b.close(); })();
