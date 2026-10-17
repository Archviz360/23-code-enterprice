import { _electron as electron, expect, test } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AICatalog, AISnapshot, SessionInfo } from '../../src/lib/ai';

function stream(response: ServerResponse, delta: unknown, reason = 'stop') {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (value: unknown, finish: string | null) => `data: ${JSON.stringify({ id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model: 'test-coder', choices: [{ index: 0, delta: value, finish_reason: finish }] })}\n\n`;
  response.write(chunk({ role: 'assistant', ...delta as object }, null));
  response.write(chunk({}, reason));
  response.end('data: [DONE]\n\n');
}

test('native AI: Ollama discovery, streaming, tool approvals, plan, cancellation and session recovery', async () => {
  test.skip(process.platform !== 'win32', 'Bundled Windows OpenCode runtime.');
  test.setTimeout(180000);
  const base = path.join(process.env.LOCALAPPDATA!, 'Temp/opencode');
  const fixture = await mkdtemp(path.join(base, '23-ai-workspace-'));
  const profile = await mkdtemp(path.join(base, '23-ai-profile-'));
  await writeFile(path.join(fixture, 'hello.txt'), 'existing file');
  const tools: string[][] = [];
  const server = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    const json = (value: unknown) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (request.url === '/api/tags') return json({ models: [{ name: 'test-coder:latest', model: 'test-coder:latest', modified_at: new Date().toISOString(), size: 1000, digest: 'fixture', details: { format: 'gguf', family: 'llama', parameter_size: '8B', quantization_level: 'Q4_K_M' } }] });
    if (request.url === '/api/show') return json({ capabilities: ['completion', 'tools'], model_info: { 'general.architecture': 'llama', 'llama.context_length': 32768 }, parameters: 'num_ctx 32768' });
    if (request.url === '/api/version') return json({ version: '0.12.0' });
    if (request.url === '/v1/models') return json({ object: 'list', data: [{ id: 'test-coder:latest', object: 'model', owned_by: 'ollama' }] });
    if (request.url === '/v1/chat/completions') {
      const body = JSON.parse(text) as { messages: { role: string; content?: unknown }[]; tools?: { function: { name: string } }[] };
      tools.push((body.tools ?? []).map(t => t.function.name));
      const last = body.messages.at(-1);
      if (last?.role === 'user' && String(last.content).includes('WAIT_FOREVER')) {
        response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write(': waiting\n\n'); return;
      }
      if (last?.role === 'user' && String(last.content).includes('CREATE_FILE')) return stream(response, { tool_calls: [{ index: 0, id: 'call_fixture', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: String(last.content).includes('PLAN') ? 'plan-created.txt' : 'agent-created.txt', content: 'AGENT_WRITE_OK' }) } }] }, 'tool_calls');
      if (last?.role === 'user' && String(last.content).includes('RUN_SHELL')) return stream(response, { tool_calls: [{ index: 0, id: 'call_shell', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ command: 'echo AGENT_SHELL_OK' }) } }] }, 'tool_calls');
      if (last?.role === 'user' && String(last.content).includes('ASK_QUESTION')) return stream(response, { tool_calls: [{ index: 0, id: 'call_question', type: 'function', function: { name: 'question', arguments: JSON.stringify({ questions: [{ header: 'Route', question: 'Choose a route', options: [{ label: 'First', description: 'First route' }, { label: 'Second', description: 'Second route' }] }] }) } }] }, 'tool_calls');
      return stream(response, { content: last?.role === 'tool' ? 'TOOL_FINISHED' : 'LOCAL_MODEL_STREAM_OK' });
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => name !== 'ELECTRON_RUN_AS_NODE' && value !== undefined)) as Record<string, string>;
  const executablePath = process.env.IDE_PACKAGED_EXE;
  const app = await electron.launch({ ...(executablePath ? { executablePath, args: [`--profile=${profile}`] } : { args: ['.', `--profile=${profile}`] }), env });
  try {
    await app.evaluate(({ dialog }, fixture) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showMessageBoxSync = () => 1;
    }, fixture);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Enable AI', exact: true }).click();
    await expect(page.getByLabel('AI model')).toBeVisible({ timeout: 45000 });
    await page.getByText(/Providers & local Ollama/).click();
    await page.getByLabel('Ollama URL', { exact: true }).fill(url);
    await page.getByRole('button', { name: 'Connect Ollama', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Connected to Ollama' })).toBeVisible({ timeout: 30000 });
    let catalog: AICatalog;
    await expect.poll(async () => {
      catalog = await page.evaluate(() => window.desktop!.aiRequest<AICatalog>('catalog'));
      return catalog.models.some(model => model.providerID === 'ollama' && model.id === 'test-coder:latest');
    }, { timeout: 30000 }).toBe(true);
    await page.getByRole('button', { name: 'Refresh AI', exact: true }).click();
    await page.getByLabel('AI model').selectOption('ollama/test-coder:latest');
    await page.getByText(/Providers & local Ollama/).click();
    await page.getByLabel('AI prompt', { exact: true }).fill('Say hello');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByLabel('AI conversation', { exact: true })).toContainText('LOCAL_MODEL_STREAM_OK', { timeout: 45000 });
    const sessions = await page.evaluate(() => window.desktop!.aiRequest<SessionInfo[]>('sessions'));
    expect(sessions).toHaveLength(1);
    const sessionID = sessions[0].id;
    const snapshot = () => page.evaluate(sessionID => window.desktop!.aiRequest<AISnapshot>('snapshot', { sessionID }), sessionID);
    await expect.poll(async () => (await snapshot()).active).toBeNull();

    // A real OpenCode tool must wait for the UI; no paid or external model is contacted.
    await page.getByLabel('AI prompt', { exact: true }).fill('CREATE_FILE');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Approval: edit', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(access(path.join(fixture, 'agent-created.txt'))).rejects.toThrow();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect.poll(async () => (await snapshot()).active).toBeNull();
    await expect(access(path.join(fixture, 'agent-created.txt'))).rejects.toThrow();
    await page.getByLabel('AI prompt', { exact: true }).fill('CREATE_FILE');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Approval: edit', { exact: true })).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    await expect.poll(() => readFile(path.join(fixture, 'agent-created.txt'), 'utf8').catch(() => ''), { timeout: 15000 }).toBe('AGENT_WRITE_OK');
    await expect.poll(async () => (await snapshot()).active).toBeNull();
    expect(tools.some(names => names.includes('write'))).toBe(true);
    await expect(page.getByLabel('AI conversation', { exact: true })).toContainText('TOOL_FINISHED');

    await page.getByLabel('AI prompt', { exact: true }).fill('RUN_SHELL');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Approval: shell', { exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    await expect.poll(async () => (await snapshot()).messages.some(message => message.type === 'assistant' && message.content.some(part => part.type === 'tool' && part.name === 'shell' && part.state.status === 'completed' && JSON.stringify(part.state.content).includes('AGENT_SHELL_OK'))), { timeout: 30000 }).toBe(true);
    await expect.poll(async () => (await snapshot()).active).toBeNull();
    await page.getByLabel('AI prompt', { exact: true }).fill('ASK_QUESTION');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('.ai-form')).toBeVisible({ timeout: 30000 });
    if (await page.locator('.ai-form select').count()) await page.locator('.ai-form select').selectOption({ index: 1 });
    else await page.locator('.ai-form input').first().fill('First');
    await page.locator('.ai-form').getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(async () => (await snapshot()).active).toBeNull();
    await expect(page.locator('.ai-form')).toHaveCount(0);

    await page.getByLabel('AI prompt', { exact: true }).fill('WAIT_FOREVER');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => !!(await snapshot()).active).toBe(true);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(async () => (await snapshot()).active).toBeNull();
    const plan = await page.evaluate(() => window.desktop!.aiRequest<SessionInfo>('create', { mode: 'plan' }));
    expect(plan.permissions).toContainEqual({ action: 'edit', resource: '*', effect: 'deny' });
    expect(plan.permissions).toContainEqual({ action: 'shell', resource: '*', effect: 'deny' });
    await page.evaluate(sessionID => window.desktop!.aiRequest('prompt', { sessionID, text: 'CREATE_FILE_PLAN', model: { providerID: 'ollama', id: 'test-coder:latest' } }), plan.id);
    await expect.poll(async () => (await page.evaluate(sessionID => window.desktop!.aiRequest<AISnapshot>('snapshot', { sessionID }), plan.id)).active, { timeout: 20000 }).toBeNull();
    await expect(access(path.join(fixture, 'plan-created.txt'))).rejects.toThrow();
    await page.getByRole('button', { name: 'Explorer', exact: true }).click();
    await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Enable AI', exact: true }).click();
    await page.getByLabel('AI session', { exact: true }).selectOption(sessionID);
    await expect(page.getByLabel('AI conversation', { exact: true })).toContainText('LOCAL_MODEL_STREAM_OK');
    await expect(page.locator('.ai-view').getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Native OpenCode terminal', exact: true }).click();
    await expect.poll(async () => page.evaluate(async () => (await window.desktop!.terminalList()).some(t => t.name === 'OpenCode' && !t.exited && t.backlog.length > 50)), { timeout: 30000 }).toBe(true);
    await page.evaluate(async () => { for (const terminal of await window.desktop!.terminalList()) await window.desktop!.terminalClose(terminal.id); });

    // Kill only this test profile's engine and verify an existing app can reconnect.
    const registration = path.join(profile, 'ai/state/opencode/service.json');
    const old = JSON.parse(await readFile(registration, 'utf8')) as { pid: number };
    process.kill(old.pid);
    await expect.poll(async () => {
      try {
        await page.evaluate(() => window.desktop!.aiRequest('catalog'));
        const current = JSON.parse(await readFile(registration, 'utf8')) as { pid: number };
        return current.pid !== old.pid;
      } catch { return false; }
    }, { timeout: 45000 }).toBe(true);
    expect((await page.evaluate(() => window.desktop!.aiRequest<SessionInfo[]>('sessions'))).some(s => s.id === sessionID)).toBe(true);

    // Cancelling app.quit must leave both the window and its AI service usable.
    await page.getByRole('button', { name: 'Explorer', exact: true }).click();
    await page.getByRole('button', { name: 'hello.txt', exact: true }).click();
    await page.locator('.monaco-editor textarea').first().focus();
    await page.keyboard.insertText('unsaved close regression');
    await app.evaluate(({ app, dialog }) => {
      const state = dialog as typeof dialog & { cancelledCloseCount: number };
      state.cancelledCloseCount = 0;
      dialog.showMessageBoxSync = () => { state.cancelledCloseCount++; return 0; };
      app.quit();
    });
    await expect.poll(() => app.evaluate(({ dialog }) => (dialog as typeof dialog & { cancelledCloseCount: number }).cancelledCloseCount)).toBeGreaterThan(0);
    await expect(page.locator('.monaco-editor')).toBeVisible();
    expect((await page.evaluate(() => window.desktop!.aiRequest<AICatalog>('catalog'))).version).toBe('2.0.31');
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  } finally {
    await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
