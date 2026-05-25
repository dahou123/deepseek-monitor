// 生成 DeepSeek Monitor 应用图标
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 64, 128, 256];

function createPNG(size, r, g, b) {
  const cx = size/2, cy = size/2, rad = size/2 - 1;
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size, 0);

  for (let y = 0; y < size; y++) {
    const off = y * rowLen;
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x-cx)**2 + (y-cy)**2);
      if (d <= rad) {
        const a = d > rad-1.5 ? Math.max(0,Math.min(255,Math.round((rad-d)*255/1.5))) : 255;
        const i = off + 1 + x*4;
        raw[i]=r; raw[i+1]=g; raw[i+2]=b; raw[i+3]=a;
      }
    }
  }
  return pngEncode(raw, size);
}

function pngEncode(raw, size) {
  const zlib = require('zlib');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;

  const compressed = zlib.deflateSync(raw, {level: 1});

  const png = Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
  return png;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = crc32(crcData);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc);
  return Buffer.concat([len, typeB, data, crcB]);
}

function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 生成图标
const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });

// 生成各尺寸 PNG
for (const size of SIZES) {
  const png = createPNG(size, 79, 107, 237);
  fs.writeFileSync(path.join(outDir, `${size}.png`), png);
  console.log(`生成 ${size}x${size}.png`);
}

// 生成 ICO（多尺寸）
function createICO() {
  const entries = [];
  const pngs = [];
  let offset = 6 + SIZES.length * 16;

  for (const size of SIZES) {
    const png = createPNG(size, 79, 107, 237);
    pngs.push(png);
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[4] = 1; // 1 plane
    entry[5] = 32; // 32 bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  const header = Buffer.alloc(6);
  header[0]=0; header[1]=0; header[2]=1; header[3]=0;
  header.writeUInt16LE(SIZES.length, 4);

  const ico = Buffer.concat([header, ...entries, ...pngs]);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
  console.log('生成 icon.ico');
}

createICO();
console.log('图标生成完成！');
