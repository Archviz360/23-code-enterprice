import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { extract } = require('../../electron/services/extensions.cjs') as { extract(archive: string, destination: string): Promise<void> };
const temporary = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA!, 'Temp/opencode') : os.tmpdir();
function zipFile(name: string, content: string) {
  const filename = Buffer.from(name), bytes = Buffer.from(content);
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length + bytes.length, 16);
  return Buffer.concat([local, filename, bytes, central, filename, end]);
}
describe('extension archives', () => {
  it('extracts a compatible VSIX-layout package without executing anything', async () => {
    const directory = await mkdtemp(path.join(temporary, '23-code-archive-'));
    const archive = path.join(directory, 'example.vsix');
    await writeFile(archive, zipFile('extension/package.json', '{"engines":{"23code":"^0.2.0"}}'));
    await extract(archive, path.join(directory, 'extracted'));
    expect(JSON.parse(await readFile(path.join(directory, 'extracted/extension/package.json'), 'utf8')).engines['23code']).toBe('^0.2.0');
  });
  it('rejects archive traversal before writing outside the destination', async () => {
    const directory = await mkdtemp(path.join(temporary, '23-code-bad-archive-'));
    const archive = path.join(directory, 'hostile.zip');
    await writeFile(archive, zipFile('../escaped.txt', 'bad'));
    await expect(extract(archive, path.join(directory, 'extracted'))).rejects.toThrow();
    await expect(readFile(path.join(directory, 'escaped.txt'))).rejects.toThrow();
  });
});
