// Build all logo/icon files from the traced path.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const [, , pathFile, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const raw = fs.readFileSync(pathFile, 'utf8');
const d = raw.replace(/-?\d+\.\d+/g, n => (+n).toFixed(1).replace(/\.0$/, ''));
const NAVY = '#16202a', PEACH = '#EAB393';
// logo bbox in trace space (2048 canvas, 4x of 512)
const BX = 168, BY = 424, BW = 1712, BH = 1192;

// wordmark only, tight box with tiny pad
function mark(fill) {
  const p = 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BX - p} ${BY - p} ${BW + 2 * p} ${BH + 2 * p}"><path fill="${fill}" d="${d}"/></svg>\n`;
}
// square icon: logo width = frac of side, centered, on navy (radius r as fraction)
function icon(frac, r, bg = NAVY, fill = PEACH) {
  const S = BW / frac, ox = BX - (S - BW) / 2, oy = BY - (S - BH) / 2;
  const rect = bg ? `<rect x="${ox}" y="${oy}" width="${S}" height="${S}" rx="${S * r}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox} ${oy} ${S} ${S}">${rect}<path fill="${fill}" d="${d}"/></svg>\n`;
}
const w = (n, s) => fs.writeFileSync(path.join(outDir, n), s);
(async () => {
  w('jarian-mark.svg', mark(PEACH));
  w('jarian-mark-navy.svg', mark(NAVY));
  w('icon.svg', icon(0.9, 0.2));
  w('icon-maskable.svg', icon(0.66, 0));
  const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(outDir, file));
  await png(icon(0.84, 0.2), 192, 'icon-192.png');
  await png(icon(0.84, 0.2), 512, 'icon-512.png');
  await png(icon(0.66, 0), 512, 'icon-maskable-512.png');
  await png(icon(0.8, 0), 180, 'apple-touch-icon.png');
  // favicon frames: small sizes get the logo edge-to-edge, square corners
  const frames = [];
  for (const [s, f, r] of [[16, 1.0, 0.18], [32, 0.94, 0.2], [48, 0.9, 0.2]]) {
    const b = await sharp(Buffer.from(icon(f, r)), { density: 300 }).resize(s, s).png().toBuffer();
    fs.writeFileSync(path.join(outDir, `fav-${s}.png`), b);
    frames.push([s, b]);
  }
  // ICO container with PNG frames
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let off = head.length;
  frames.forEach(([s, b], i) => {
    const o = 6 + 16 * i;
    head[o] = s; head[o + 1] = s; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(b.length, o + 8); head.writeUInt32LE(off, o + 12); off += b.length;
  });
  fs.writeFileSync(path.join(outDir, 'favicon.ico'), Buffer.concat([head, ...frames.map(f => f[1])]));
  console.log('ok, mark.svg bytes', mark(PEACH).length);
})();
