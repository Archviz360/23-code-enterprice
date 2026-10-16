import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('production desktop: local workers, filesystem safety, real Git and real shell commands', async () => {
  test.setTimeout(90000);
  const base = path.join(process.env.LOCALAPPDATA ?? process.env.TMPDIR ?? '/tmp', process.platform === 'win32' ? 'Temp/opencode' : '');
  const fixture = await mkdtemp(path.join(base, '23-code-test-'));
  const profile = await mkdtemp(path.join(base, '23-code-profile-'));
  await writeFile(path.join(fixture, 'hello.ts'), 'export const hello = 1;\n');
  execFileSync('git', ['init'], { cwd: fixture });
  execFileSync('git', ['config', 'user.name', 'Editor Test'], { cwd: fixture });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: fixture });
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined && name !== 'ELECTRON_RUN_AS_NODE') environment[name] = value;
  const app = await electron.launch({ args: ['.', `--profile=${profile}`], env: environment });
  try {
    await app.evaluate(({ dialog }, folder) => {
      // Replace only the native chooser/approval dialogs; all operations use real files/processes.
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showMessageBoxSync = () => 1;
    }, fixture);
    const page = await app.firstWindow();
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await expect(page.getByRole('tab', { name: /hello.ts/ })).toBeVisible();
    const result = await page.evaluate(async () => {
      const api = window.desktop!;
      const original = await api.readFile('hello.ts');
      await api.writeFile('hello.ts', 'export const hello = 2;\n', original);
      let traversalBlocked = false, conflictBlocked = false;
      try { await api.readFile('../outside.txt'); } catch { traversalBlocked = true; }
      try { await api.writeFile('hello.ts', 'bad', original); } catch { conflictBlocked = true; }
      const status = await api.gitStatus();
      await api.gitAction('stage', 'hello.ts');
      const staged = await api.gitStatus();
      await api.gitAction('unstage', 'hello.ts');
      const unstaged = await api.gitStatus();
      await api.gitAction('stage', 'hello.ts');
      const commit = await api.gitAction('commit', 'Test editor Git integration');
      await api.writeFile('nested/new.txt', 'temporary file', '\0');
      await api.renameFile('nested/new.txt', 'nested/renamed.txt');
      const renamed = await api.readFile('nested/renamed.txt');
      await api.deleteFile('nested/renamed.txt');
      const shell = await api.run('echo desktop-shell-ok');
      return { traversalBlocked, conflictBlocked, status, staged, unstaged, commit, renamed, shell };
    });
    expect(result.traversalBlocked).toBe(true);
    expect(result.conflictBlocked).toBe(true);
    expect(result.status.changes.some(c => c.path === 'hello.ts')).toBe(true);
    expect(result.staged.changes.some(c => c.path === 'hello.ts' && c.index === 'A')).toBe(true);
    expect(result.unstaged.changes.some(c => c.path === 'hello.ts' && c.index === '?')).toBe(true);
    expect(result.commit).toContain('Test editor Git integration');
    expect(result.renamed).toBe('temporary file');
    expect(result.shell.stdout).toContain('desktop-shell-ok');
    expect(result.shell.code).toBe(0);
    expect(await readFile(path.join(fixture, 'hello.ts'), 'utf8')).toBe('export const hello = 2;\n');
    // Production file:// loading must also support language workers, not just render a shell.
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('const broken: number = "wrong";');
    await page.keyboard.press('Control+Shift+m');
    await expect(page.locator('.problem-list .error').first()).toBeVisible({ timeout: 20000 });
  } finally { await app.close(); }
});
