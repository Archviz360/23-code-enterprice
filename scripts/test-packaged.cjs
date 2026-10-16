const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { version } = require('../package.json');
const executable = path.resolve('release/win-unpacked/23 Code Enterprise.exe');
const portable = path.resolve(`release/23-Code-Enterprise-Portable-${version}-x64.exe`);
if (!fs.existsSync(executable) || !fs.existsSync(portable)) throw new Error('Build the Windows executables with npm run package:win first.');
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', 'tests/e2e/packaged.spec.ts', 'tests/e2e/ide-features.spec.ts', '--grep', 'Windows executable|native custom IDE'], {
  stdio: 'inherit', env: { ...process.env, IDE_PACKAGED_EXE: executable },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
