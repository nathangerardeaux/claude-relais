// Draws the Relais logo (same as `.logo` in public/style.css: rounded square cut along the diagonal,
// blue top-left, green bottom-right) with no dependency: PNG written by hand (zlib), and an .ico that
// embeds PNG images (allowed since Windows Vista). Usage: node tableau/bureau/icone/generer.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ici = import.meta.dirname;
const BLEU = [0x39, 0x87, 0xe5];
const VERT = [0x19, 0x9e, 0x70];
const RAYON = 6 / 22; // border-radius 6px on a 22px logo
const SUR = 4;        // 4x4 sub-samples per pixel: smooth edges

// Is point (x, y) (0..1) inside the rounded square?
function dedans(x, y) {
  const r = RAYON;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function dessiner(taille) {
  const px = Buffer.alloc(taille * taille * 4);
  for (let j = 0; j < taille; j++) {
    for (let i = 0; i < taille; i++) {
      let nBleu = 0, nVert = 0;
      for (let sj = 0; sj < SUR; sj++) {
        for (let si = 0; si < SUR; si++) {
          const x = (i + (si + 0.5) / SUR) / taille;
          const y = (j + (sj + 0.5) / SUR) / taille;
          if (!dedans(x, y)) continue;
          if (x + y < 1) nBleu++; else nVert++;
        }
      }
      const n = nBleu + nVert;
      const o = (j * taille + i) * 4;
      if (!n) continue;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round((BLEU[c] * nBleu + VERT[c] * nVert) / n);
      px[o + 3] = Math.round((255 * n) / (SUR * SUR));
    }
  }
  return px;
}

function morceau(type, donnees) {
  const t = Buffer.from(type, 'ascii');
  const lg = Buffer.alloc(4); lg.writeUInt32BE(donnees.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, donnees])) >>> 0);
  return Buffer.concat([lg, t, donnees, crc]);
}

function png(taille) {
  const px = dessiner(taille);
  const brut = Buffer.alloc(taille * (taille * 4 + 1));
  for (let j = 0; j < taille; j++) {
    brut[j * (taille * 4 + 1)] = 0; // filter: none
    px.copy(brut, j * (taille * 4 + 1) + 1, j * taille * 4, (j + 1) * taille * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr), morceau('IDAT', zlib.deflateSync(brut, { level: 9 })), morceau('IEND', Buffer.alloc(0)),
  ]);
}

// .ico: 6-byte header, one 16-byte entry per image, then the PNG files.
function ico(tailles) {
  const images = tailles.map((t) => [t, png(t)]);
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0); entete.writeUInt16LE(1, 2); entete.writeUInt16LE(images.length, 4);
  let decalage = 6 + 16 * images.length;
  const entrees = images.map(([t, d]) => {
    const e = Buffer.alloc(16);
    e[0] = t >= 256 ? 0 : t; e[1] = t >= 256 ? 0 : t; // 0 = 256
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(d.length, 8); e.writeUInt32LE(decalage, 12);
    decalage += d.length;
    return e;
  });
  return Buffer.concat([entete, ...entrees, ...images.map(([, d]) => d)]);
}

fs.writeFileSync(path.join(ici, 'relais.png'), png(256));
fs.writeFileSync(path.join(ici, 'relais.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('Icône écrite : relais.png (256x256) et relais.ico (16 à 256 px).');
