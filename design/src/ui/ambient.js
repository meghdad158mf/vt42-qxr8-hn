// پس‌زمینه‌ی نقطه‌ای آرام کل صفحه (canvas#ambient)

export function setupAmbient(){
  // ambient dot-field — quiet tactile backdrop, paused under reduced-motion
  (function(){
    const cv = document.getElementById('ambient');
    const ctx = cv.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w,h,dpr;
    function size(){
      dpr = Math.min(window.devicePixelRatio||1, 2);
      w = cv.width = innerWidth*dpr; h = cv.height = innerHeight*dpr;
      cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
    }
    const GAP = 34;
    function draw(t){
      ctx.clearRect(0,0,w,h);
      const cols = Math.ceil(w/(GAP*dpr))+1, rows = Math.ceil(h/(GAP*dpr))+1;
      for(let y=0;y<rows;y++){
        for(let x=0;x<cols;x++){
          const px = x*GAP*dpr, py = y*GAP*dpr;
          const wobble = reduced ? 0 : Math.sin((t||0)/2600 + x*0.5 + y*0.5)*1.2;
          const alt = (x+y)%2===0;
          ctx.beginPath();
          ctx.arc(px, py+wobble*dpr, 1*dpr, 0, Math.PI*2);
          ctx.fillStyle = alt ? 'rgba(58,80,104,0.14)' : 'rgba(181,101,29,0.10)';
          ctx.fill();
        }
      }
    }
    size();
    window.addEventListener('resize', ()=>{ size(); if(reduced) draw(0); });
    if(reduced){ draw(0); }
    else{ requestAnimationFrame(function loop(t){ draw(t); requestAnimationFrame(loop); }); }
  })();
}

