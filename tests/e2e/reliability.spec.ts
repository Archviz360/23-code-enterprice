import { expect, test } from '@playwright/test';

test('hidden editor refactorings update buffers and survive switching tabs and recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  for (const name of ['visible.txt', 'hidden.txt']) {
    await page.keyboard.press('Control+n');
    await page.getByRole('textbox', { name: 'File path', exact: true }).fill(name);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
  }
  await page.getByRole('tab', { name: /visible.txt/ }).click();
  await page.evaluate(async () => {
    const modulePath = '/src/lib/monaco.ts';
    const { monaco } = await import(/* @vite-ignore */ modulePath) as typeof import('../../src/lib/monaco');
    const model = monaco.editor.getModel(monaco.Uri.from({ scheme: 'file', path: '/workspace/hidden.txt' }));
    if (!model) throw new Error('Hidden file model not loaded');
    model.applyEdits([{ range: model.getFullModelRange(), text: 'HIDDEN_REFACTOR_KEPT' }]);
  });
  await page.getByRole('tab', { name: /hidden.txt/ }).click();
  await expect(page.locator('.monaco-editor').first()).toContainText('HIDDEN_REFACTOR_KEPT');
  await page.reload();
  await expect(page.locator('.monaco-editor').first()).toContainText('HIDDEN_REFACTOR_KEPT');
  expect(errors).toEqual([]);
});

test('malformed recovery fields cannot crash the editor on startup', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('23-code-workspace-v1', JSON.stringify({ version: 0, state: { files: [{ id: 'valid', path: 'rescued.txt', content: 'RECOVERED_TEXT', savedContent: '', language: 'plaintext' }, null, { bad: true }], tabs: ['missing', 'valid', 'valid'], activeId: 'missing', settings: { fontSize: 'bad', minimap: false }, roots: [null, { invalid: true }], workspaceKey: 42 } })));
  await page.reload();
  await expect(page.locator('.monaco-editor')).toContainText('RECOVERED_TEXT');
  await expect(page.getByRole('tab', { name: /rescued.txt/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});
