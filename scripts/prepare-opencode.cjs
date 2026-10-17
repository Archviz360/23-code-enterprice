const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { executable } = require('../electron/services/ai.cjs');
  const source = executable({ isPackaged: false });
  const destination = path.resolve(__dirname, '../build/opencode');
  await fs.mkdir(destination, { recursive: true });
  await fs.copyFile(source, path.join(destination, 'opencode.exe'));
  await fs.copyFile(path.resolve(__dirname, '../docs/OPENCODE-LICENSE.txt'), path.join(destination, 'LICENSE.txt'));
  console.log('Prepared bundled OpenCode 2.0.31 Windows runtime.');
})().catch(error => { console.error(error); process.exitCode = 1; });
