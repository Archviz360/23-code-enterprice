import { expect, test, type Page } from '@playwright/test';

async function load(page: Page) {
  await page.goto('/');
  await expect(page.locator('.monaco-editor')).toBeVisible();
}
async function createFile(page: Page, name: string) {
  await page.keyboard.press('Control+n');
  await page.getByRole('textbox', { name: 'File path', exact: true }).fill(name);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: false })).toBeVisible();
}
async function content(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('23-code-workspace-v1')!).state.files);
}
test('edits, switches tabs, closes without data loss, and recovers after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await load(page);
  await createFile(page, 'first.ts');
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.type('const answer = 42;');
  await createFile(page, 'second.py');
  await page.getByRole('tab', { name: /first.ts/ }).click();
  await expect.poll(async () => (await content(page)).find((f: { path: string }) => f.path === 'first.ts').content).toBe('const answer = 42;');
  await page.screenshot({ path: 'test-results/workbench.png' });
  await page.getByRole('button', { name: 'Close first.ts', exact: true }).click();
  await expect(page.getByRole('tab', { name: /second.py/ })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  expect((await content(page)).find((f: { path: string }) => f.path === 'first.ts').content).toBe('const answer = 42;');
  expect(errors).toEqual([]);
});
test('command palette, workspace replacement, quick open, settings and terminal limitations work', async ({ page }) => {
  await load(page);
  await createFile(page, 'hello.txt');
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.type('hello hello');
  await page.keyboard.press('Control+Shift+f');
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('hello');
  await expect(page.getByText(/2 matches in 1 files/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Replace in workspace' }).fill('$world');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  await expect.poll(async () => (await content(page)).find((f: { path: string }) => f.path === 'hello.txt').content).toBe('$world $world');
  await page.keyboard.press('Control+Shift+p');
  await page.getByRole('textbox', { name: 'Search commands' }).fill('settings');
  await page.keyboard.press('Enter');
  await page.getByLabel('Font size', { exact: true }).fill('18');
  await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('18');
  await page.keyboard.press('Control+p');
  await page.getByRole('textbox', { name: 'Search files' }).fill('welcome');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: /welcome.md/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+`');
  await expect(page.getByText(/Shell commands require the desktop app/)).toBeVisible();
});
test('Monaco find/replace and language diagnostics are wired', async ({ page }) => {
  await load(page);
  await createFile(page, 'sample.json');
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.insertText('{"message":"before"}');
  await page.keyboard.press('Control+h');
  const find = page.locator('.find-widget');
  await expect(find).toBeVisible();
  await find.getByRole('textbox', { name: 'Find', exact: true }).fill('before');
  await find.getByRole('textbox', { name: 'Replace', exact: true }).fill('after');
  await find.getByRole('button', { name: /Replace All/ }).click();
  await expect.poll(async () => (await content(page)).find((f: { path: string }) => f.path === 'sample.json').content).toBe('{"message":"after"}');
  await page.keyboard.press('Escape');
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('{"invalid": }');
  await page.keyboard.press('Control+Shift+m');
  await expect(page.locator('.problem-list .error').first()).toBeVisible({ timeout: 15000 });
});
