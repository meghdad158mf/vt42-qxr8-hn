// Trace the user's flat logo PNG (navy on white) into a single SVG path.
const sharp = require('sharp');
const potrace = require('potrace');
const fs = require('fs');
const src = process.argv[2], out = process.argv[3];
(async () => {
  // upscale 4x so the curve fit follows the smooth edges, not pixels
  const big = await sharp(src).flatten({ background: '#ffffff' }).greyscale()
    .resize(2048, 2048, { kernel: 'lanczos3' }).png().toBuffer();
  potrace.trace(big, { threshold: 128, turdSize: 40, optTolerance: 0.4, alphaMax: 1, color: '#000' }, (err, svg) => {
    if (err) throw err;
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]).join(' ');
    fs.writeFileSync(out, d);
    console.log('path length', d.length);
  });
})();
