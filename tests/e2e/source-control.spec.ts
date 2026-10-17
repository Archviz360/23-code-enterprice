import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('Source Control UI stages literal filenames, shows both diffs, commits only staged work, and refreshes deletions and renames', async () => {
  test.setTimeout(90000);
  const base = path.join(process.env.LOCALAPPDATA!, 'Temp/opencode');
  const folder = await mkdtemp(path.join(base, '23-git-ui-'));
  const profile = await mkdtemp(path.join(base, '23-git-profile-'));
  const git = (...args: string[]) => execFileSync('git', ['--literal-pathspecs', ...args], { cwd: folder, encoding: 'utf8' });
  git('init'); git('config', 'user.name', 'Source Control Test'); git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  for (const file of ['tracked.txt', 'deleted.txt', 'before.txt', 'notes[1].txt', 'notes1.txt']) await writeFile(path.join(folder, file), 'baseline\n');
  git('add', '--all'); git('commit', '-m', 'Fixture baseline');
  await writeFile(path.join(folder, 'tracked.txt'), 'staged version\n');
  await writeFile(path.join(folder, 'notes[1].txt'), 'bracket filename edit\n');
  await writeFile(path.join(folder, 'notes1.txt'), 'must stay unstaged\n');
  await writeFile(path.join(folder, 'new.txt'), 'newly added\n');
  await unlink(path.join(folder, 'deleted.txt'));
  git('mv', 'before.txt', 'after.txt');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const executablePath = process.env.IDE_PACKAGED_EXE;
  const app = await electron.launch({ ...(executablePath ? { executablePath, args: [`--profile=${profile}`] } : { args: ['.', `--profile=${profile}`] }), env });
  try {
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      dialog.showMessageBoxSync = () => 1;
    }, folder);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.locator('.activity-bar').getByRole('button', { name: 'Source Control', exact: true }).click();
    const view = page.locator('[aria-label="git sidebar"]');
    await expect(view.getByText(/^Branch:/)).toBeVisible();
    await expect(view.getByRole('button', { name: 'Diff after.txt', exact: true })).toBeVisible();
    await expect(view.getByRole('button', { name: 'Stage deleted.txt', exact: true })).toBeVisible();

    await view.getByRole('button', { name: 'Unstage after.txt', exact: true }).click();
    await expect.poll(() => git('diff', '--cached', '--name-only').trim()).toBe('');
    await view.getByRole('button', { name: 'Stage after.txt', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Unstage after.txt', exact: true })).toBeVisible();
    await view.getByRole('button', { name: 'Stage before.txt', exact: true }).click();
    await expect.poll(() => git('diff', '--cached', '--name-status')).toContain('R100');

    await view.getByRole('button', { name: 'Stage notes[1].txt', exact: true }).click();
    await expect.poll(() => git('diff', '--cached', '--name-only', '-z').split('\0')).toContain('notes[1].txt');
    expect(git('diff', '--cached', '--name-only', '-z').split('\0')).not.toContain('notes1.txt');
    await view.getByRole('button', { name: 'Unstage notes[1].txt', exact: true }).click();
    await expect.poll(() => git('diff', '--cached', '--name-only', '-z').split('\0')).not.toContain('notes[1].txt');

    await view.getByRole('button', { name: 'Stage tracked.txt', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Unstage tracked.txt', exact: true })).toBeVisible();
    // The working tree now equals HEAD, but staged changes still need to be shown.
    await writeFile(path.join(folder, 'tracked.txt'), 'baseline\n');
    await view.getByRole('button', { name: 'Diff tracked.txt', exact: true }).click();
    await expect(page.locator('.output')).toContainText('+staged version');
    await expect(page.locator('.output')).toContainText('-staged version');
    await view.getByRole('button', { name: 'Stage deleted.txt', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Unstage deleted.txt', exact: true })).toBeVisible();
    await view.getByRole('button', { name: 'Stage new.txt', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Unstage new.txt', exact: true })).toBeVisible();
    await view.getByLabel('Commit message', { exact: true }).fill('Commit from actual Source Control UI');
    await view.getByRole('button', { name: 'Commit staged changes', exact: true }).click();
    await expect.poll(() => git('log', '-1', '--format=%s').trim()).toBe('Commit from actual Source Control UI');
    const committed = git('show', '--format=', '--name-only', 'HEAD').split('\n');
    expect(committed).toContain('new.txt'); expect(committed).toContain('deleted.txt'); expect(committed).toContain('after.txt');
    expect(committed).not.toContain('notes1.txt'); expect(committed).not.toContain('notes[1].txt');
    expect(git('show', 'HEAD:tracked.txt')).toBe('staged version\n');
    await expect(view.getByRole('button', { name: 'Stage tracked.txt', exact: true })).toBeVisible();
    await expect(view.getByRole('alert')).toHaveCount(0);
    git('checkout', '--detach', 'HEAD');
    await view.getByRole('button', { name: 'Refresh Git', exact: true }).click();
    await expect(view.getByText('Branch: (detached HEAD)', { exact: true })).toBeVisible();
  } finally { await app.close(); }
});

test('Source Control UI handles first commits, unstaging new files, and isolated multi-root repositories', async () => {
  test.setTimeout(90000);
  const base = path.join(process.env.LOCALAPPDATA!, 'Temp/opencode');
  const first = await mkdtemp(path.join(base, '23-git-first-'));
  const second = await mkdtemp(path.join(base, '23-git-second-'));
  const profile = await mkdtemp(path.join(base, '23-git-profile-'));
  const git = (folder: string, ...args: string[]) => execFileSync('git', ['--literal-pathspecs', ...args], { cwd: folder, encoding: 'utf8' });
  for (const folder of [first, second]) {
    git(folder, 'init'); git(folder, 'config', 'user.name', 'Source Control Test'); git(folder, 'config', 'user.email', 'test@example.invalid'); git(folder, 'config', 'core.autocrlf', 'false');
  }
  await writeFile(path.join(first, 'first [draft].txt'), 'FIRST_COMMIT_CONTENT\n');
  await writeFile(path.join(second, 'second.txt'), 'baseline\n');
  git(second, 'add', '--all'); git(second, 'commit', '-m', 'Second fixture'); git(second, 'branch', '-m', 'other-root');
  await writeFile(path.join(second, 'second.txt'), 'SECOND_ROOT_EDIT\n');
  const firstBranch = git(first, 'branch', '--show-current').trim();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const executablePath = process.env.IDE_PACKAGED_EXE;
  const app = await electron.launch({ ...(executablePath ? { executablePath, args: [`--profile=${profile}`] } : { args: ['.', `--profile=${profile}`] }), env });
  try {
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); dialog.showMessageBoxSync = () => 1; }, first);
    const page = await app.firstWindow();
    const explorer = () => page.locator('.activity-bar').getByRole('button', { name: 'Explorer', exact: true }).click();
    const sourceControl = () => page.locator('.activity-bar').getByRole('button', { name: 'Source Control', exact: true }).click();
    const view = page.locator('[aria-label="git sidebar"]');
    await page.getByRole('button', { name: 'Open folder', exact: true }).click(); await sourceControl();
    await expect(view.getByText(`Branch: ${firstBranch}`, { exact: true })).toBeVisible();
    await view.getByRole('button', { name: 'Stage first [draft].txt', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Unstage first [draft].txt', exact: true })).toBeVisible();
    await view.getByRole('button', { name: 'Diff first [draft].txt', exact: true }).click();
    await expect(page.locator('.output')).toContainText('+FIRST_COMMIT_CONTENT');
    await view.getByRole('button', { name: 'Unstage first [draft].txt', exact: true }).click();
    await expect.poll(() => git(first, 'ls-files')).toBe('');
    expect(await readFile(path.join(first, 'first [draft].txt'), 'utf8')).toBe('FIRST_COMMIT_CONTENT\n');
    await view.getByRole('button', { name: 'Stage first [draft].txt', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Unstage first [draft].txt', exact: true })).toBeVisible();
    await view.getByLabel('Commit message').fill('First commit from the editor');
    await view.getByRole('button', { name: 'Commit staged changes', exact: true }).click();
    await expect(view.getByText('Working tree clean.', { exact: true })).toBeVisible();
    expect(git(first, 'log', '-1', '--format=%s').trim()).toBe('First commit from the editor');

    await explorer();
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, second);
    await page.getByRole('button', { name: 'Add Folder', exact: true }).click();
    await expect(page.getByLabel('Active workspace root').locator('option')).toHaveCount(2);
    await page.getByLabel('Active workspace root').selectOption({ label: `${path.basename(second)} (local)` });
    await sourceControl();
    await expect(view.getByText('Branch: other-root', { exact: true })).toBeVisible();
    await view.getByRole('button', { name: /^Stage @.+\/second\.txt$/ }).click();
    await expect(view.getByRole('button', { name: /^Unstage @.+\/second\.txt$/ })).toBeVisible();
    await view.getByLabel('Commit message').fill('Only the second root');
    await view.getByRole('button', { name: 'Commit staged changes', exact: true }).click();
    await expect(view.getByText('Working tree clean.', { exact: true })).toBeVisible();
    expect(git(second, 'log', '-1', '--format=%s').trim()).toBe('Only the second root');
    expect(git(first, 'log', '-1', '--format=%s').trim()).toBe('First commit from the editor');
    await expect(view.getByRole('alert')).toHaveCount(0);

    const nested = path.join(first, 'nested'); await mkdir(nested);
    await explorer();
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, nested);
    await page.getByRole('button', { name: 'Open folder', exact: true }).click(); await sourceControl();
    await expect(view.getByRole('alert')).toContainText('Open the Git repository root folder');
    expect(git(first, 'log', '-1', '--format=%s').trim()).toBe('First commit from the editor');
  } finally { await app.close(); }
});
