/**
 * 无第三方依赖地生成 1024x1024 应用图标源图（RGBA PNG）。
 * 产物交给 `tauri icon` 派生各平台尺寸。
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const buf = new Uint8Array(SIZE * SIZE * 4); // 默认全透明

/** 归一化颜色写入，支持 alpha 混合 */
function blend(x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || a <= 0) return;
  const i = (y * SIZE + x) * 4;
  const da = buf[i + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  buf[i] = Math.round((r * a + buf[i] * da * (1 - a)) / outA);
  buf[i + 1] = Math.round((g * a + buf[i + 1] * da * (1 - a)) / outA);
  buf[i + 2] = Math.round((b * a + buf[i + 2] * da * (1 - a)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function rect(x0, y0, x1, y1, color, a = 1) {
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) blend(x, y, color, a);
  }
}

/** 圆角矩形，带 1px 内边框与柔和抗锯齿 */
function roundRect(x0, y0, x1, y1, radius, fill, border) {
  for (let y = Math.floor(y0) - 2; y < y1 + 2; y++) {
    for (let x = Math.floor(x0) - 2; x < x1 + 2; x++) {
      const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
      const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
      const d = Math.hypot(x - cx, y - cy);
      const cover = Math.min(1, Math.max(0, radius + 0.5 - d));
      if (cover <= 0) continue;
      const edge = border && d > radius - 6 ? border : fill;
      blend(x, y, edge, cover);
    }
  }
}

function disc(cx, cy, r, color, a = 1) {
  for (let y = Math.floor(cy - r) - 2; y <= cy + r + 2; y++) {
    for (let x = Math.floor(cx - r) - 2; x <= cx + r + 2; x++) {
      const cover = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - cx, y - cy)));
      if (cover > 0) blend(x, y, color, cover * a);
    }
  }
}

const ROPE = hex('#8B6F47');
const ROPE_HI = hex('#A0826D');
const PAPER = hex('#FDF6E3');
const FOLD = hex('#EADFC6');
const BORDER = hex('#C6B189');
const INK = hex('#4A3728');
const STAMP = hex('#C0392B');

// 绳子：交替条纹模拟麻绳
for (let y = 40; y < 300; y++) {
  const stripe = Math.floor(y / 9) % 2 === 0 ? ROPE : ROPE_HI;
  rect(500, y, 524, y + 1, stripe);
}
// 绳结
disc(512, 306, 34, ROPE);
disc(504, 298, 12, ROPE_HI, 0.6);

// 卡片投影
roundRect(220, 348, 812, 940, 34, hex('#000000'), null);
for (let i = 0; i < buf.length; i += 4) {
  // 把刚画的纯黑层压成柔和阴影
  if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 0 && buf[i + 3] > 0) buf[i + 3] = 26;
}

// 卡片本体
roundRect(208, 336, 800, 928, 30, PAPER, BORDER);
// 顶部穿绳孔
disc(504, 386, 22, hex('#8A7554'), 0.85);
disc(504, 383, 18, hex('#E4D7B8'), 1);
disc(504, 386, 15, hex('#7A6647'), 0.9);

// 文字线（模拟手写短句）
const lines = [
  [278, 520, 730],
  [278, 604, 690],
  [278, 688, 610],
];
for (const [x, y, w] of lines) {
  for (let i = 0; i < 22; i++) {
    const wob = Math.sin(i * 0.9) * 3;
    rect(x, y + wob, x + w, y + 22 + wob, INK, 0.82);
  }
}

// 右下折角
for (let y = 828; y < 928; y++) {
  for (let x = 700; x < 800; x++) {
    if (x - 700 + (928 - y) > 100) blend(x, y, FOLD, 1);
  }
}

// 印章
disc(662, 800, 74, STAMP, 0.92);
disc(662, 800, 60, PAPER, 1);
disc(662, 800, 52, STAMP, 0.92);
rect(628, 762, 696, 776, PAPER, 0.95);
rect(628, 794, 696, 808, PAPER, 0.95);
rect(628, 826, 696, 840, PAPER, 0.95);

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  Buffer.from(buf.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/icon-source.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log('icon source written:', out, png.length, 'bytes');
