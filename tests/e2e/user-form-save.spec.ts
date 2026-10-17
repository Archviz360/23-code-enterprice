import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Small User Form · 23 Code Test</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 16px; background: #eef2f8; color: #172033;
      font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 560px; margin: 0 auto; padding: 32px; background: white;
      border: 1px solid #dae2ee; border-radius: 18px; box-shadow: 0 12px 40px #17203310; }
    .eyebrow { margin: 0; color: #3657c5; font-size: 12px; font-weight: 700; letter-spacing: .1em; }
    h1 { margin: 8px 0; font-size: 30px; }
    .intro, footer { color: #536079; }
    label { display: block; margin: 18px 0 6px; font-weight: 600; }
    input, select, textarea { width: 100%; padding: 11px 12px; border: 1px solid #aebbd0;
      border-radius: 8px; background: white; color: inherit; font: inherit; }
    input:focus, select:focus, textarea:focus { outline: 3px solid #cad5ff; border-color: #3657c5; }
    textarea { min-height: 88px; resize: vertical; }
    .actions { display: flex; gap: 12px; margin-top: 24px; }
    button { padding: 11px 18px; border: 1px solid #3657c5; border-radius: 8px;
      background: #3657c5; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button[type="reset"] { background: white; color: #3657c5; }
    #result { margin-top: 24px; padding: 16px; border-radius: 10px; background: #e9f8ef; color: #175c36; }
    #result h2 { font-size: 18px; margin: 0 0 8px; }
    #summary { margin: 0; overflow-wrap: anywhere; white-space: pre-line; }
    footer { margin-top: 24px; font-size: 12px; }
    @media (max-width: 480px) { main { padding: 22px; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">23 CODE ENTERPRISE · EDITOR SAVE TEST</p>
    <h1>Create a user</h1>
    <p class="intro">A small, working form created and saved through the desktop editor.</p>
    <form id="user-form">
      <label for="full-name">Full name *</label>
      <input id="full-name" name="fullName" autocomplete="name" maxlength="100" required>
      <label for="email">Email address *</label>
      <input id="email" name="email" type="email" autocomplete="email" maxlength="200" required>
      <label for="role">Role *</label>
      <select id="role" name="role" required>
        <option value="">Choose a role</option>
        <option>Developer</option>
        <option>Designer</option>
        <option>Other</option>
      </select>
      <label for="notes">Notes (optional)</label>
      <textarea id="notes" name="notes" maxlength="500" placeholder="Add a short note…"></textarea>
      <div class="actions">
        <button type="submit">Create user</button>
        <button type="reset">Clear form</button>
      </div>
    </form>
    <section id="result" role="status" aria-live="polite" hidden>
      <h2>User form submitted successfully</h2>
      <p id="summary"></p>
    </section>
    <footer>Local demonstration only. No account is created, and no information is sent or stored.</footer>
  </main>
  <script>
    const form = document.getElementById('user-form');
    const result = document.getElementById('result');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      document.getElementById('summary').textContent =
        'Name: ' + data.get('fullName') + '\\n' +
        'Email: ' + data.get('email') + '\\n' +
        'Role: ' + data.get('role') +
        (data.get('notes') ? '\\nNotes: ' + data.get('notes') : '');
      result.hidden = false;
    });
    form.addEventListener('reset', () => { result.hidden = true; });
  </script>
</body>
</html>
`;
const normalize = (value: string) => value.replaceAll('\r\n', '\n');
const sameSource = (value: string) => normalize(value).split('\n').map(line => line.trim()).join('\n').trim();

// Explicit opt-in: ordinary regression runs never write into a user's folder.
test('packaged editor creates, saves and reopens a working small user form in the requested folder', async ({ browser }) => {
  test.skip(!process.env.IDE_FORM_TEST_DIR, 'Set IDE_FORM_TEST_DIR explicitly to run this requested-folder acceptance test.');
  test.setTimeout(90000);
  const folder = path.resolve(process.env.IDE_FORM_TEST_DIR!);
  const executablePath = path.resolve(process.env.IDE_PACKAGED_EXE ?? 'release/win-unpacked/23 Code Enterprise.exe');
  await access(folder);
  await access(executablePath);
  const file = path.join(folder, 'user-form.html');
  let existing: string | undefined;
  try { existing = await readFile(file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing !== undefined && sameSource(existing) !== sameSource(html)) throw new Error(`Refusing to overwrite an existing different file: ${file}`);
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined && name !== 'ELECTRON_RUN_AS_NODE') environment[name] = value;
  const temporary = path.join(process.env.LOCALAPPDATA!, 'Temp/opencode');
  async function launch() {
    const profile = await mkdtemp(path.join(temporary, '23-code-form-'));
    const app = await electron.launch({ executablePath, args: [`--profile=${profile}`], env: environment });
    await app.evaluate(({ dialog }, folder) => {
      // Only the native chooser is automated. Typing and Ctrl+S use the real editor.
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      dialog.showMessageBoxSync = () => 1;
    }, folder);
    return app;
  }
  async function openFolder(app: ElectronApplication) {
    const page = await app.firstWindow();
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('23-code-workspace-v1')!).state.roots[0]?.kind)).toBe('local');
    return page;
  }
  const checks: string[] = [];
  let savedSource = '';
  const app = await launch();
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const page = await openFolder(app);
    if (existing === undefined) {
      await page.keyboard.press('Control+n');
      await page.getByRole('textbox', { name: 'File path', exact: true }).fill('user-form.html');
      await page.getByRole('button', { name: 'OK', exact: true }).click();
    } else await page.getByRole('button', { name: 'user-form.html', exact: true }).click();
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.press('Control+a');
    // Paste through Monaco's real textarea handler, preserving indentation rather
    // than simulating multiline typing (which intentionally applies auto-indent).
    await page.locator('.monaco-editor textarea').first().evaluate((textarea, content) => {
      const data = new DataTransfer(); data.setData('text/plain', content);
      textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, html);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('23-code-workspace-v1')!).state.files.find((file: { path: string }) => file.path === 'user-form.html').content).then(normalize)).toBe(html);
    const detectedLanguage = await page.getByRole('button', { name: 'Language mode', exact: true }).innerText();
    if (detectedLanguage !== 'HTML') {
      checks.push(`Issue found: automatic .html detection selected ${detectedLanguage}; selected HTML manually using the language picker.`);
      await page.getByRole('button', { name: 'Language mode', exact: true }).click();
      await page.getByRole('textbox', { name: 'Search programming languages' }).fill('HTML');
      await page.getByRole('option', { name: /^HTML(?:\s|Built-in)/ }).click();
    }
    await expect(page.getByRole('button', { name: 'Language mode', exact: true })).toHaveText('HTML');
    savedSource = await page.evaluate(() => JSON.parse(localStorage.getItem('23-code-workspace-v1')!).state.files.find((file: { path: string }) => file.path === 'user-form.html').content);
    await page.keyboard.press('Control+s');
    await expect.poll(async () => { try { return await readFile(file, 'utf8'); } catch { return ''; } }).toBe(savedSource);
    await expect(page.getByRole('tab', { name: 'user-form.html', exact: true })).not.toHaveAccessibleName(/Unsaved/);
    checks.push('Created HTML source through the actual packaged Monaco editor and saved with Ctrl+S; disk bytes match.');
  } finally { await app.close(); }

  // A fresh app profile cannot recover the buffer from the first session.
  const reopened = await launch();
  try {
    const page = await openFolder(reopened);
    await page.getByRole('button', { name: 'user-form.html', exact: true }).click();
    const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('23-code-workspace-v1')!).state.files.find((file: { path: string }) => file.path === 'user-form.html'));
    expect(recovered.content).toBe(savedSource);
    expect(recovered.savedContent).toBe(savedSource);
    checks.push('Restarted the packaged application with a fresh profile and reopened the saved source from disk.');
  } finally { await reopened.close(); }

  const context = await browser.newContext({ viewport: { width: 1000, height: 1050 } });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests: string[] = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await context.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(file).toString());
    await expect(page.getByRole('heading', { name: 'Create a user', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await expect(page.getByRole('status')).toBeHidden();
    expect(await page.locator('form').evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
    checks.push('Required-field validation rejects an empty form.');
    await page.getByLabel('Full name *', { exact: true }).fill('Alex Example');
    await page.getByLabel('Email address *', { exact: true }).fill('invalid-email');
    await page.getByLabel('Role *', { exact: true }).selectOption('Developer');
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await expect(page.getByRole('status')).toBeHidden();
    checks.push('Email validation rejects an invalid address.');
    await page.getByLabel('Email address *', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Notes (optional)', { exact: true }).fill('Created and saved using 23 Code Enterprise.');
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('User form submitted successfully');
    await expect(page.getByRole('status')).toContainText('Alex Example');
    await expect(page.getByRole('status')).toContainText('alex@example.com');
    checks.push('Valid input displays the submitted user name, email and role.');
    await page.screenshot({ path: path.join(folder, 'user-form-test.png'), fullPage: true });
    await page.getByRole('button', { name: 'Clear form', exact: true }).click();
    await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Email address *', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Role *', { exact: true })).toHaveValue('');
    await expect(page.getByRole('status')).toBeHidden();
    expect(errors).toEqual([]); expect(requests).toEqual([]);
    checks.push('Reset clears the form and confirmation; no JavaScript errors or HTTP requests occurred.');
  } finally { await context.close(); }
  await writeFile(path.join(folder, 'user-form-test-report.json'), JSON.stringify({ passed: true, testedAt: new Date().toISOString(), executable: executablePath, file, checks, enginesTested: [], note: 'Local form demonstration only; no real account, backend, or data submission.' }, null, 2) + '\n');
});
