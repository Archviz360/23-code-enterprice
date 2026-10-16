import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function chooseFolder(app: ElectronApplication, folder: string) {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    dialog.showMessageBoxSync = () => 1;
  }, folder);
}

test('native custom IDE services: PTY, tasks, extension host, Pyright, debugger and multi-root workspace', async () => {
  test.skip(process.platform !== 'win32', 'This native integration fixture exercises Windows PowerShell.');
  test.setTimeout(180000);
  const base = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA!, 'Temp/opencode') : os.tmpdir();
  const fixture = await mkdtemp(path.join(base, '23-code-features-'));
  const other = await mkdtemp(path.join(base, '23-code-other-'));
  const profile = await mkdtemp(path.join(base, '23-code-profile-'));
  await mkdir(path.join(fixture, '.23code'));
  await writeFile(path.join(fixture, 'debug.js'), 'let value = 41;\nvalue += 1;\nconsole.log(value);\n');
  await writeFile(path.join(fixture, 'sample.py'), 'value: int = "wrong"\n');
  await writeFile(path.join(other, 'other.txt'), 'second workspace root');
  await writeFile(path.join(fixture, '.23code/tasks.json'), JSON.stringify({ tasks: [
    { label: 'prepare', type: 'shell', command: 'echo PREPARE_TASK_OK' },
    { label: 'test-build', type: 'shell', command: 'echo BUILD_TASK_OK', dependsOn: ['prepare'] },
  ] }));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  const executablePath = process.env.IDE_PACKAGED_EXE;
  const app = await electron.launch({ ...(executablePath ? { executablePath, args: [`--profile=${profile}`] } : { args: ['.', `--profile=${profile}`] }), env });
  try {
    await chooseFolder(app, fixture);
    const page = await app.firstWindow();
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.getByRole('button', { name: 'debug.js', exact: true }).click();
    await expect(page.getByRole('tab', { name: /debug.js/ })).toBeVisible();

    const terminal = await page.evaluate(async () => {
      const api = window.desktop!;
      const session = await api.terminalCreate({ cols: 100, rows: 25 });
      const output = new Promise<string>((resolve, reject) => {
        let transcript = '';
        const timeout = setTimeout(() => { unsubscribe(); reject(new Error('PTY persistent-state check timed out: ' + transcript)); }, 20000);
        const unsubscribe = api.onEvent(event => {
          if (event.type === 'terminal-data' && event.id === session.id) {
            transcript += event.data;
            if (transcript.includes('PTY_PERSIST_42')) { clearTimeout(timeout); unsubscribe(); resolve(transcript); }
          }
        });
      });
      await api.terminalWrite(session.id, '$probe = 41\r');
      await api.terminalWrite(session.id, '"PTY_PERSIST_$($probe + 1)"\r');
      const transcript = await output;
      await api.terminalClose(session.id);
      return transcript;
    });
    expect(terminal).toContain('PTY_PERSIST_42');

    const taskResult = await page.evaluate(async () => {
      const api = window.desktop!;
      const completion = new Promise<string[]>((resolve, reject) => {
        const labels: string[] = [];
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Tasks did not finish.')); }, 30000);
        const unsubscribe = api.onEvent(event => {
          if (event.type === 'task' && event.status === 'succeeded') {
            labels.push(event.label);
            if (event.label === 'test-build') { clearTimeout(timer); unsubscribe(); resolve(labels); }
          }
        });
      });
      await api.tasksRun('test-build', 'debug.js');
      const labels = await completion;
      const terminals = await api.terminalList();
      for (const terminal of terminals) await api.terminalClose(terminal.id);
      return { labels, output: terminals.map(terminal => terminal.backlog).join('\n') };
    });
    expect(taskResult.labels).toEqual(['prepare', 'test-build']);
    expect(taskResult.output).toContain('BUILD_TASK_OK');

    await chooseFolder(app, path.resolve('examples/hello-extension'));
    const extension = await page.evaluate(async () => {
      const api = window.desktop!;
      const installed = await api.extensionsInstall(true);
      const commands = await api.extensionCommands();
      const result = await api.extensionRun('23code.hello', 'hello.uppercase', { path: 'sample.txt', text: 'working extension', language: 'plaintext' });
      return { installed: installed.map(extension => extension.id), commands, result };
    });
    expect(extension.installed).toContain('23code.hello');
    expect(extension.commands.some(command => command.id === 'hello.uppercase')).toBe(true);
    expect(extension.result.text).toBe('WORKING EXTENSION');

    const languageResult = await page.evaluate(async () => {
      const api = window.desktop!;
      const logs: string[] = [];
      const unsubscribeLogs = api.onEvent(event => { if (event.type === 'service-log' && event.service.startsWith('lsp:')) logs.push(event.text); });
      const diagnostics = new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Pyright diagnostics did not arrive.')); }, 45000);
        const unsubscribe = api.onEvent(event => {
          if (event.type === 'diagnostics' && event.path === 'sample.py' && event.diagnostics.some(diagnostic => diagnostic.severity === 1)) {
            clearTimeout(timer); unsubscribe(); resolve(event.diagnostics.map(diagnostic => diagnostic.message));
          }
        });
      });
      let session;
      try { session = await api.languageStart('builtin-python'); }
      catch (error) { unsubscribeLogs(); throw new Error((error as Error).message + '\n' + logs.join('\n')); }
      unsubscribeLogs();
      const uri = await api.languageDocument(session.id, { path: 'sample.py', language: 'python', text: 'value: int = "wrong"\n' });
      const messages = await diagnostics;
      const hover = await api.languageRequest(session.id, 'textDocument/hover', { textDocument: { uri }, position: { line: 0, character: 2 } });
      await api.languageStop(session.id);
      return { messages, hover };
    });
    expect(languageResult.messages.join(' ')).toContain('int');
    expect(languageResult.hover).toBeTruthy();

    const debug = await page.evaluate(async () => {
      const api = window.desktop!;
      const paused = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Debugger did not hit breakpoint.')); }, 20000);
        const unsubscribe = api.onEvent(event => { if (event.type === 'debug-state' && event.state === 'paused') { clearTimeout(timer); unsubscribe(); resolve(); } });
      });
      await api.debugStart('Node: Debug active JavaScript file', 'debug.js', { 'debug.js': [2] });
      await paused;
      const stack = await api.debugRequest<{ stackFrames: { id: number; line: number }[] }>('stackTrace');
      const frameId = stack.stackFrames[0].id;
      const scopes = await api.debugRequest<{ scopes: { variablesReference: number }[] }>('scopes', { frameId });
      const variables = await api.debugRequest<{ variables: { name: string; value: string }[] }>('variables', { variablesReference: scopes.scopes[0].variablesReference });
      const watch = await api.debugRequest<{ result: string }>('evaluate', { frameId, expression: 'value' });
      const stepped = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Debugger did not step.')); }, 10000);
        const unsubscribe = api.onEvent(event => { if (event.type === 'debug-state' && event.state === 'paused') { clearTimeout(timer); unsubscribe(); resolve(); } });
      });
      await api.debugRequest('next');
      await stepped;
      const afterStep = await api.debugRequest<{ result: string }>('evaluate', { frameId: 1, expression: 'value' });
      await api.debugStop();
      return { stack, variables, watch, afterStep };
    });
    expect(debug.stack.stackFrames[0].line).toBe(2);
    expect(debug.watch.result).toBe('41');
    expect(debug.afterStep.result).toBe('42');
    expect(debug.variables.variables.some(variable => variable.name === 'value')).toBe(true);

    await chooseFolder(app, other);
    const snapshot = await page.evaluate(async () => window.desktop!.addFolder());
    expect(snapshot?.roots).toHaveLength(2);
    expect(snapshot?.files.some(file => file.path.startsWith('@') && file.path.endsWith('/other.txt'))).toBe(true);
    const descriptor = path.join(fixture, 'saved.23-workspace');
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, descriptor);
    await page.evaluate(async () => window.desktop!.saveWorkspace());
    expect(JSON.parse(await readFile(descriptor, 'utf8')).folders).toHaveLength(2);
    await chooseFolder(app, descriptor);
    const reopened = await page.evaluate(async () => window.desktop!.loadWorkspace());
    expect(reopened?.roots).toHaveLength(2);
  } finally { await app.close(); }
});

test('browser split editors keep independent selections and shared persisted buffers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.keyboard.press('Control+n');
  await page.getByRole('textbox', { name: 'File path', exact: true }).fill('split.txt');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.keyboard.press('Control+\\');
  await expect(page.getByRole('region', { name: 'Secondary editor group' })).toBeVisible();
  await page.getByRole('region', { name: 'Secondary editor group' }).locator('.monaco-editor textarea').focus();
  await page.getByRole('button', { name: 'welcome.md', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Primary editor group' }).locator('.breadcrumbs')).toContainText('split.txt');
  await expect(page.getByRole('region', { name: 'Secondary editor group' }).locator('.breadcrumbs')).toContainText('welcome.md');
  await page.getByRole('region', { name: 'Primary editor group' }).locator('.monaco-editor textarea').focus();
  await page.keyboard.type('independent split content');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('23-code-workspace-v1')!).state.files.find((file: { path: string }) => file.path === 'split.txt').content)).toBe('independent split content');
});
