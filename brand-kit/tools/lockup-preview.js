const { chromium } = require('playwright'); const fs=require('fs');
const D = process.env.D, OUTP = process.env.OUTP, NAMES = (process.env.NAMES||'').split(',');
(async()=>{
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1400,height:900} });
  const bg = n=>n.includes('on-light')||n.includes('navy') ? '#F4EEE8' : '#16202A';
  const cells = NAMES.map(n=>`<div style="background:${bg(n)};border-radius:18px;padding:30px;display:flex;align-items:center;justify-content:center;min-height:320px"><img src="data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(D+'/'+n)).toString('base64')}" style="max-width:100%;max-height:300px"></div>`).join('');
  await p.setContent(`<html><body style="margin:0;padding:24px;background:#0f161d;display:grid;grid-template-columns:repeat(${process.env.COLS||4},1fr);gap:18px">${cells}</body></html>`);
  await p.waitForTimeout(400); await p.screenshot({ path: OUTP, fullPage:true }); await b.close();
})();
