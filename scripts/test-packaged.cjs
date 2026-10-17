const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { version } = require('../package.json');
const asar = require('@electron/asar');
const executable = path.resolve('release/win-unpacked/23 Code Enterprise.exe');
const portable = path.resolve(`release/23-Code-Enterprise-Portable-${version}-x64.exe`);
if (!fs.existsSync(executable) || !fs.existsSync(portable)) throw new Error('Build the Windows executables with npm run package:win first.');
const archive = path.resolve('release/win-unpacked/resources/app.asar');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
for (const file of [...walk('electron'), ...walk('dist'), ...walk('docs')]) {
  if (!fs.readFileSync(file).equals(asar.extractFile(archive, file))) throw new Error(`Packaged file is stale: ${file}. Rebuild with npm run package:win.`);
}
if (JSON.parse(asar.extractFile(archive, 'package.json').toString()).version !== version) throw new Error('Packaged application version is stale. Rebuild with npm run package:win.');
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', 'tests/e2e/packaged.spec.ts', 'tests/e2e/ide-features.spec.ts', 'tests/e2e/ai.spec.ts', 'tests/e2e/source-control.spec.ts', 'tests/e2e/languages-engines.spec.ts', '--grep', 'Windows executable|native custom IDE|native AI|Source Control UI|native game-engine'], {
  stdio: 'inherit', env: { ...process.env, IDE_PACKAGED_EXE: executable },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
