// «موضوعات پرتکرار» به شکل حباب (۵.۳۵.۰): مساحت هر حباب متناسب با وزن موضوع، نام داخل حباب.
// چیدمان: بزرگ‌ترین وسط، بقیه نزدیک‌ترین جای خالی به مرکز (حلزونی)؛ اگر جا نشد، همه کوچک‌تر.
import { escAttr, escHtml, toFaDigits } from '../../core/text.js';

const GAP = 6;
// رنگ‌های تیره‌ی پالت (سرمه‌ای، خاکستری، قهوه‌ای) متن سفید می‌گیرند؛ روشن‌ها متن تیره
const DARK = new Set(['#16202a', '#5b6472', '#3a4756', '#b5651d']);

function layout(radii, W, H){
  const placed = [];
  const fits = (x, y, r) => x - r >= 0 && x + r <= W && y - r >= 0 && y + r <= H
    && placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP);
  for(const r of radii){
    let best = null;
    if(!placed.length){ best = { x: W / 2, y: H / 2 }; }
    else{
      for(let d = 0; d <= Math.max(W, H) && !best; d += 3){
        let cand = null;
        for(let a = 0; a < 360; a += 8){
          const x = W / 2 + d * Math.cos(a * Math.PI / 180) * (W / H > 1 ? 1.25 : 1);
          const y = H / 2 + d * Math.sin(a * Math.PI / 180);
          if(fits(x, y, r)){ cand = { x, y }; break; }
        }
        best = cand;
      }
    }
    if(!best) return null;
    placed.push({ ...best, r });
  }
  return placed;
}

export function renderTopicBubbles(box, topics, colors){
  const draw = () => {
    const W = box.clientWidth, H = box.clientHeight;
    if(!W || !H) return;
    const items = topics.map(([name, w], i) => ({ name, w: Math.max(Number(w) || 0, 0.0001), color: colors[i % colors.length] }))
      .sort((a, b) => b.w - a.w);
    const maxW = items[0].w;
    // حباب بزرگ اول تقریباً ۴۲٪ ارتفاع؛ اگر جا نشد ۸٪ کوچک‌تر تا وقتی همه جا شوند
    let scale = Math.min(W, H) * 0.42, placed = null;
    for(let k = 0; k < 20 && !placed; k++, scale *= 0.92){
      placed = layout(items.map(it => Math.max(30, scale * Math.sqrt(it.w / maxW))), W, H);
    }
    if(!placed) return;
    const total = items.reduce((s, it) => s + it.w, 0);
    box.innerHTML = placed.map((p, i) => {
      const it = items[i];
      const share = Math.round(it.w / total * 100);
      // اندازه‌ی قلم طوری که بلندترین واژه وسط کلمه نشکند (هر نویسه‌ی فارسی ~۰٫۶ قلم)
      const longest = Math.max(...String(it.name).split(/\s+/).map(s => s.length), 1);
      const fs = Math.max(10, Math.min(15, p.r / 3.2, (p.r * 1.6) / (longest * 0.6)));
      const fg = DARK.has(it.color) ? '#fff' : '#16202a';
      return `<div class="tb-bubble" title="${escAttr(it.name)}: ${toFaDigits(share)}٪"
        style="width:${p.r * 2}px;height:${p.r * 2}px;left:${p.x - p.r}px;top:${p.y - p.r}px;background:${it.color};color:${fg};font-size:${fs}px">
        <span class="tb-name">${escHtml(it.name)}</span>${p.r >= 34 ? `<span class="tb-share">${toFaDigits(share)}٪</span>` : ''}</div>`;
    }).join('');
  };
  draw();
  // تغییر عرض (چرخش گوشی، باز و بسته شدن پنجره) → چیدمان دوباره
  if(!box._tbObserver && typeof ResizeObserver !== 'undefined'){
    let lastW = box.clientWidth;
    box._tbObserver = new ResizeObserver(() => { if(box.clientWidth !== lastW){ lastW = box.clientWidth; box._tbRedraw?.(); } });
    box._tbObserver.observe(box);
  }
  box._tbRedraw = draw;
}
