// Generate a multi-resolution Windows icon using only Node's standard library.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const segments = [[.33, .32, .15, .5], [.15, .5, .33, .68], [.67, .32, .85, .5], [.85, .5, .67, .68], [.57, .25, .43, .75]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    const distance = Math.hypot(Math.max(Math.abs(u - .5) - .33, 0), Math.max(Math.abs(v - .5) - .33, 0));
    const inside = distance <= .14;
    const code = segments.some(([ax, ay, bx, by]) => {
      const t = Math.max(0, Math.min(1, ((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      return Math.hypot(u - ax - t * (bx - ax), v - ay - t * (by - ay)) < .032;
    });
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    raw[offset] = code ? 76 : 24;
    raw[offset + 1] = code ? 167 : 24;
    raw[offset + 2] = code ? 237 : 24;
    raw[offset + 3] = inside ? 255 : 0;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let position = header.length;
sizes.forEach((size, index) => {
  const offset = 6 + index * 16;
  header[offset] = size % 256; header[offset + 1] = size % 256;
  header.writeUInt16LE(1, offset + 4); header.writeUInt16LE(32, offset + 6);
  header.writeUInt32LE(images[index].length, offset + 8); header.writeUInt32LE(position, offset + 12);
  position += images[index].length;
});
const destination = path.join(__dirname, '../build/icon.ico');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, Buffer.concat([header, ...images]));
console.log(`Created ${destination}`);
