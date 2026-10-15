// Renders the pixel-art knight to icons/icon{16,32,48,128}.png.
// Run with: node tools/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// 16x16 grid. Edit the art here and re-run.
// # background, O outline, W body, S shading, E eye, . transparent (rounded corners)
const ART = [
  '.##############.',
  '#######OO#######',
  '######OWWOO#####',
  '#####OWWWWWO####',
  '####OWWEWWWWO###',
  '###OWWWWWWWWSO##',
  '##OWWWWWWWWWSO##',
  '##OWWWOOWWWWSO##',
  '###OOO#OWWWWSO##',
  '######OWWWWSSO##',
  '#####OWWWWWSSO##',
  '#####OWWWWWWSO##',
  '####OOOOOOOOOOO#',
  '####OWWWWWWWWSO#',
  '####OOOOOOOOOOO#',
  '.##############.',
];

const COLORS = {
  '.': [0, 0, 0, 0],
  '#': [38, 36, 33, 255], // Lichess-style dark board
  O: [12, 12, 12, 255],
  W: [242, 238, 228, 255],
  S: [176, 168, 152, 255],
  E: [214, 79, 0, 255], // orange eye
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const scale = size / ART.length;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1); // first byte of each row is the filter type (0)
    for (let x = 0; x < size; x++) {
      const rgba = COLORS[ART[Math.floor(y / scale)][Math.floor(x / scale)]];
      raw.set(rgba, rowStart + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`icon${size}.png`, outDir), png(size));
}
console.log('Wrote icons/icon{16,32,48,128}.png');
