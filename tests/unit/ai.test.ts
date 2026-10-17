import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
interface Rule { action: string; resource: string; effect: string }
interface Service {
  request<T = unknown>(action: string, input?: Record<string, unknown>): Promise<T>;
  start(): Promise<unknown>;
  client: unknown;
}
const { AI, permissions } = require('../../electron/services/ai.cjs') as {
  AI: new (...args: unknown[]) => Service;
  permissions(mode: string): Rule[];
};
const directory = path.resolve('test-project');
const session = { id: 's1', location: { directory }, metadata: { client: '23-code-enterprise', mode: 'build' } };
function setup() {
  const root = { id: 'root', kind: 'local', path: directory };
  const approve = vi.fn(async () => {});
  const client = {
    server: { info: vi.fn(async () => ({ version: '2.0.31' })) },
    session: { get: vi.fn(async () => session), create: vi.fn(async () => session), update: vi.fn(async () => {}), switchModel: vi.fn(async () => {}), prompt: vi.fn(async () => ({})) },
    model: { list: vi.fn(async () => ({ data: [{ id: 'model', providerID: 'test', name: 'Test', enabled: true, settings: { apiKey: 'SECRET' }, headers: { Authorization: 'SECRET' }, variants: [] }] })) },
    integration: {
      list: vi.fn(async () => ({ data: [{ id: 'test', name: 'Test', methods: [], connections: [], metadata: { secret: 'SECRET' } }] })),
      connect: { key: vi.fn(async () => {}) },
      oauth: {
        connect: vi.fn(async () => ({ data: { attemptID: 'attempt1', url: 'https://accounts.example.test/authorize', instructions: 'Sign in', mode: 'auto' } })),
        status: vi.fn(async () => ({ data: { status: 'complete' } })),
        complete: vi.fn(async () => {}), cancel: vi.fn(async () => {}),
      },
    },
    permission: { reply: vi.fn(async () => {}) },
  };
  const openExternal = vi.fn(async () => {});
  const ai = new AI({ getPath: () => 'profile' }, { active: () => root, approve }, {}, () => {}, { openExternal });
  ai.client = client;
  ai.start = vi.fn(async () => client);
  return { ai, client, root, approve, openExternal };
}

describe('AI native boundary', () => {
  it('does not start an engine for unsupported actions or remote roots', async () => {
    const { ai, root } = setup();
    await expect(ai.request('arbitrary-http')).rejects.toThrow('Invalid AI request');
    root.kind = 'ssh';
    await expect(ai.request('catalog')).rejects.toThrow('local folder');
    expect(ai.start).not.toHaveBeenCalled();
  });
  it('requires project trust before loading any project configuration', async () => {
    const { ai, approve } = setup();
    approve.mockRejectedValue(new Error('Not trusted'));
    await expect(ai.request('catalog')).rejects.toThrow('Not trusted');
    expect(ai.start).not.toHaveBeenCalled();
  });
  it('asks for trust once across parallel catalog requests and strips provider secrets', async () => {
    const { ai, approve } = setup();
    const [result] = await Promise.all([ai.request('catalog'), ai.request('catalog')]);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('scopes session actions to the active local folder and app-owned history', async () => {
    const { ai, client } = setup();
    client.session.get.mockResolvedValue({ ...session, location: { directory: path.resolve('other-folder') } });
    await expect(ai.request('stop', { sessionID: 'foreign' })).rejects.toThrow('active folder');
    client.session.get.mockResolvedValue({ ...session, metadata: { client: 'other-app', mode: 'build' } });
    await expect(ai.request('stop', { sessionID: 'foreign' })).rejects.toThrow('active folder');
  });
  it('never allows durable blanket approvals from the panel', async () => {
    const { ai, client } = setup();
    await expect(ai.request('permission', { sessionID: 's1', requestID: 'p1', reply: 'always' })).rejects.toThrow('allow-once');
    expect(client.permission.reply).not.toHaveBeenCalled();
    await ai.request('permission', { sessionID: 's1', requestID: 'p1', reply: 'once' });
    expect(client.permission.reply).toHaveBeenCalledWith({ sessionID: 's1', requestID: 'p1', decision: 'once' });
  });
  it('reapplies the approval policy before submitting a prompt', async () => {
    const { ai, client } = setup();
    await ai.request('prompt', { sessionID: 's1', text: 'Review this', model: { providerID: 'test', id: 'model' } });
    expect(client.session.update).toHaveBeenCalledWith({ sessionID: 's1', permissions: permissions('build') });
    expect(client.session.prompt).toHaveBeenCalledWith({ sessionID: 's1', text: 'Review this' });
  });
  it('reserves a session before async setup so concurrent sends cannot submit twice', async () => {
    const { ai, client } = setup();
    let release!: () => void;
    client.session.update.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const input = { sessionID: 's1', text: 'Review', model: { providerID: 'test', id: 'model' } };
    const first = ai.request('prompt', input);
    await vi.waitFor(() => expect(client.session.update).toHaveBeenCalled());
    await expect(ai.request('prompt', input)).rejects.toThrow('running agent');
    release(); await first;
    expect(client.session.prompt).toHaveBeenCalledTimes(1);
  });
  it('validates prompts, models, and local-only Ollama URLs', async () => {
    const { ai } = setup();
    await expect(ai.request('prompt', { sessionID: 's1', text: '' })).rejects.toThrow('Prompt');
    await expect(ai.request('prompt', { sessionID: 's1', text: 'hi' })).rejects.toThrow('Select a model');
    for (const url of ['https://example.com', 'file:///etc/passwd', 'http://127.0.0.1:11434/private', 'http://user:pass@localhost:11434']) await expect(ai.request('ollama', { url })).rejects.toThrow('local Ollama');
  });
  it('uses the official integration key API without returning the credential', async () => {
    const { ai, client } = setup();
    expect(await ai.request('key', { integrationID: 'openai', key: '  fixture-key  ' })).toBe(true);
    expect(client.integration.connect.key).toHaveBeenCalledWith({ integrationID: 'openai', key: 'fixture-key', location: { directory }, answer: undefined });
  });
  it('uses location-scoped OAuth and only opens an engine-issued authorization URL', async () => {
    const { ai, client, openExternal } = setup();
    await expect(ai.request('oauth-open', { attemptID: 'unknown', url: 'https://arbitrary.example' })).rejects.toThrow('OAuth URL');
    const result = await ai.request<{ attemptID: string }>('oauth', { integrationID: 'openai', methodID: 'chatgpt-token-sharing' });
    expect(client.integration.oauth.connect).toHaveBeenCalledWith({ integrationID: 'openai', methodID: 'chatgpt-token-sharing', location: { directory }, answer: undefined });
    await ai.request('oauth-open', { attemptID: result.attemptID, url: 'https://arbitrary.example' });
    expect(openExternal).toHaveBeenCalledWith('https://accounts.example.test/authorize');
    expect(await ai.request('oauth-status', { attemptID: result.attemptID })).toEqual({ status: 'complete' });
    await ai.request('oauth-cancel', { attemptID: result.attemptID });
    expect(client.integration.oauth.cancel).toHaveBeenCalledWith({ integrationID: 'openai', attemptID: result.attemptID, location: { directory } });
  });
});

describe('agent permission policy', () => {
  const effect = (mode: string, action: string) => permissions(mode).filter(rule => rule.action === '*' || rule.action === action).at(-1)?.effect;
  it('asks for build edits, commands, MCP, external access, and code execution', () => {
    for (const action of ['edit', 'shell', 'custom_mcp_tool', 'external_directory', 'execute']) expect(effect('build', action)).toBe('ask');
    expect(effect('build', 'subagent')).toBe('deny');
  });
  it('blocks edits and shell in Plan while allowing search and reading', () => {
    expect(effect('plan', 'edit')).toBe('deny');
    expect(effect('plan', 'shell')).toBe('deny');
    expect(effect('plan', 'grep')).toBe('allow');
  });
});
