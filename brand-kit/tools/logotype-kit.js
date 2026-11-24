// New 01-logo folder for the graphics package.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const [, , pathFile, outRoot, iconsDir, srcDir] = process.argv;
const raw = fs.readFileSync(pathFile, 'utf8');
const d = raw.replace(/-?\d+\.\d+/g, n => (+n).toFixed(1).replace(/\.0$/, ''));
const BX = 168, BY = 424, BW = 1712, BH = 1192, P = 16;
const vb = `${BX - P} ${BY - P} ${BW + 2 * P} ${BH + 2 * P}`;
const mark = (fill, bg) => {
  const rect = bg ? `<rect x="${BX - 160}" y="${BY - 160}" width="${BW + 320}" height="${BH + 320}" fill="${bg}"/>` : '';
  const box = bg ? `${BX - 160} ${BY - 160} ${BW + 320} ${BH + 320}` : vb;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${rect}<path fill="${fill}" d="${d}"/></svg>\n`;
};
const mk = p => { fs.mkdirSync(p, { recursive: true }); return p; };
const L = mk(path.join(outRoot, '01-logo'));
const svgDir = mk(path.join(L, 'logotype', 'svg')), pngDir = mk(path.join(L, 'logotype', 'png'));
const appDir = mk(path.join(L, 'app-icons')), srcOut = mk(path.join(L, 'source'));
const V = {
  'jarian-logotype-navy': ['#16202A'],
  'jarian-logotype-peach': ['#EAB393'],
  'jarian-logotype-white': ['#FFFFFF'],
  'jarian-logotype-on-navy-bg': ['#EAB393', '#16202A'],
  'jarian-logotype-on-light-bg': ['#16202A', '#FFFFFF'],
};
(async () => {
  for (const [n, [f, bg]] of Object.entries(V)) {
    const s = mark(f, bg);
    fs.writeFileSync(path.join(svgDir, n + '.svg'), s);
    await sharp(Buffer.from(s), { density: 300 }).resize({ width: 2048 }).png({ compressionLevel: 9 }).toFile(path.join(pngDir, n + '-2048.png'));
  }
  for (const f of ['icon.svg', 'icon-maskable.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.ico'])
    fs.copyFileSync(path.join(iconsDir, f), path.join(appDir, f));
  const iconSvg = fs.readFileSync(path.join(iconsDir, 'icon.svg'));
  await sharp(iconSvg, { density: 600 }).resize(1024, 1024).png().toFile(path.join(appDir, 'app-icon-1024.png'));
  for (const s of [16, 32, 48]) fs.copyFileSync(path.join(srcDir, `fav-${s}.png`), path.join(appDir, `favicon-${s}.png`));
  // preview sheet
  const tiles = [];
  const add = async (buf, w, x, y) => tiles.push({ input: await sharp(buf, { density: 200 }).resize({ width: w }).png().toBuffer(), left: x, top: y });
  const bgL = await sharp({ create: { width: 560, height: 420, channels: 4, background: '#FFFFFF' } }).png().toBuffer();
  tiles.push({ input: bgL, left: 40, top: 40 });
  await add(Buffer.from(mark('#16202A')), 440, 100, 110);
  await add(Buffer.from(mark('#EAB393')), 440, 660, 110);
  await add(iconSvg, 160, 1240, 60);
  await add(fs.readFileSync(path.join(iconsDir, 'icon-maskable-512.png')), 160, 1240, 260);
  await sharp({ create: { width: 1440, height: 500, channels: 4, background: '#16202A' } }).composite(tiles).png().toFile(path.join(L, 'preview.png'));
  console.log('done');
})();
