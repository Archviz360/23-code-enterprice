import { _electron as electron, chromium, expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';

function requireExecutable(file: string) {
  test.skip(process.platform !== 'win32', 'Windows executables require Windows.');
  const explicitlyRequested = process.argv.some(arg => arg.includes('packaged.spec'));
  test.skip(!existsSync(file) && !explicitlyRequested, 'Build the Windows app with npm run package:win first.');
  expect(existsSync(file), 'Build the Windows app with npm run package:win first.').toBe(true);
}
async function profile() {
  const temporary = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA!, 'Temp/opencode') : os.tmpdir();
  return mkdtemp(path.join(temporary, '23-code-packaged-'));
}
function environment() {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined && name !== 'ELECTRON_RUN_AS_NODE') env[name] = value;
  return env;
}
async function exerciseEditor(page: Page) {
  await page.context().setOffline(true);
  await expect(page.locator('.monaco-editor')).toBeVisible();
  expect(page.url()).toContain('app.asar/dist/index.html');
  expect(await page.evaluate(() => typeof window.desktop?.openFolder)).toBe('function');
  await page.keyboard.press('Control+n');
  await page.getByRole('textbox', { name: 'File path', exact: true }).fill('packaged.json');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.insertText('{"invalid": }');
  await page.keyboard.press('Control+Shift+m');
  await expect(page.locator('.problem-list .error').first()).toBeVisible({ timeout: 20000 });
  // Exercise a lazily imported TextMate grammar from the actual offline ASAR,
  // not just Monaco's pre-existing built-in JSON worker.
  await page.keyboard.press('Control+n');
  await page.getByRole('textbox', { name: 'File path', exact: true }).fill('packaged.f90');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.insertText('program hello\nprint *, "offline"\nend program hello');
  await expect(page.getByRole('button', { name: 'Language mode', exact: true })).toHaveText('Fortran Free Form');
  await expect.poll(() => page.locator('.monaco-editor .view-line').first().locator('span span').count()).toBeGreaterThan(1);
}

test('unpacked Windows executable starts offline with native bridge and language workers', async () => {
  const executablePath = path.resolve('release/win-unpacked/23 Code Enterprise.exe');
  requireExecutable(executablePath);
  const app = await electron.launch({ executablePath, args: [`--profile=${await profile()}`], env: environment() });
  try {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    await exerciseEditor(await app.firstWindow());
  } finally { await app.close(); }
});

test('single-file portable Windows executable extracts and runs the actual editor', async () => {
  test.setTimeout(90000);
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const executablePath = path.resolve(`release/23-Code-Enterprise-Portable-${version}-x64.exe`);
  requireExecutable(executablePath);
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  // The NSIS launcher is not Electron itself, so attach to its child via CDP instead of Node's inspector.
  const child = spawn(executablePath, [`--profile=${await profile()}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env: environment(), stdio: 'ignore' });
  let failure: Error | undefined;
  child.on('error', error => { failure = error; });
  try {
    await expect.poll(async () => {
      if (failure) throw failure;
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
    }, { timeout: 45000, message: 'Portable launcher must start its bundled Electron runtime' }).toBe(true);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? await context.waitForEvent('page');
      await exerciseEditor(page);
    } finally {
      // Terminate only this test-owned launcher/process tree, including any before-unload dialog.
      await new Promise<void>(resolve => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve()));
      await browser.close().catch(() => {});
    }
  } finally {
    if (child.pid && child.exitCode === null) await new Promise<void>(resolve => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve()));
  }
});
