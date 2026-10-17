import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
interface Root { id: string; name: string; key: string; path: string; kind: string; prefix: string }
interface Workspace {
  localRoot(path: string): Promise<Root>; installContexts(roots: Root[]): Promise<unknown>;
  write(path: string, text: string, expected: string): Promise<void>;
  execute(command: string, args: string[], context: Root): Promise<string>;
}
interface Peer {
  receive(data: Buffer): void; request(method: string): Promise<unknown>; dispose(): void;
  on(event: string, listener: (...values: unknown[]) => void): void;
}
const { Workspaces, validateRelative } = require('../../electron/services/workspaces.cjs') as { Workspaces: new (...args: unknown[]) => Workspace; validateRelative(path: string): string };
const { FramedPeer } = require('../../electron/services/rpc.cjs') as { FramedPeer: new (...args: unknown[]) => Peer };
const base = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA!, 'Temp/opencode') : os.tmpdir();

describe('native filesystem reliability', () => {
  it('serializes competing writes so only one original baseline can succeed', async () => {
    const fixture = await mkdtemp(path.join(base, '23-write-race-'));
    await writeFile(path.join(fixture, 'file.txt'), 'original');
    const workspace = new Workspaces({}, () => null);
    await workspace.installContexts([await workspace.localRoot(fixture)]);
    const results = await Promise.allSettled([workspace.write('file.txt', 'first', 'original'), workspace.write('file.txt', 'second', 'original')]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(await readFile(path.join(fixture, 'file.txt'), 'utf8')).toBe('first');
    await workspace.write('file.txt', 'after conflict', 'first');
  });
  it('rejects a file used as a workspace directory', async () => {
    const fixture = await mkdtemp(path.join(base, '23-invalid-root-'));
    const file = path.join(fixture, 'file.txt'); await writeFile(file, 'text');
    await expect(new Workspaces({}, () => null).localRoot(file)).rejects.toThrow('directory');
  });
  it('blocks stale editor writes while new roots are being loaded', async () => {
    const fixture = await mkdtemp(path.join(base, '23-root-race-'));
    const old = path.join(fixture, 'old'), next = path.join(fixture, 'next');
    await mkdir(old); await mkdir(next);
    await writeFile(path.join(old, 'file.txt'), 'same baseline'); await writeFile(path.join(next, 'file.txt'), 'same baseline');
    const workspace = new Workspaces({}, () => null);
    await workspace.installContexts([await workspace.localRoot(old)]);
    let release!: (result: unknown) => void;
    const scan = vi.fn(() => new Promise(resolve => { release = resolve; }));
    Object.assign(workspace, { snapshot: scan });
    const loading = workspace.installContexts([await workspace.localRoot(next)]);
    await vi.waitFor(() => expect(scan).toHaveBeenCalled());
    await expect(workspace.write('file.txt', 'old editor contents', 'same baseline')).rejects.toThrow('changing');
    release({}); await loading;
    expect(await readFile(path.join(next, 'file.txt'), 'utf8')).toBe('same baseline');
  });
  it.each(['CON', 'nested/NUL.txt', 'prn.log', 'COM1.js', 'LPT9', 'aux.py', 'COM¹.txt'])('rejects Windows device path %s before touching the filesystem', file => {
    expect(() => validateRelative(file)).toThrow();
  });
});

describe('framed protocol fault handling', () => {
  function fixture() {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
    return { peer: new FramedPeer(child), child };
  }
  it('ignores JSON primitives and malformed JSON without crashing the native process', () => {
    const { peer } = fixture();
    for (const text of ['null', '[]', '42', '{bad']) {
      const payload = Buffer.from(text);
      expect(() => peer.receive(Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`), payload]))).not.toThrow();
    }
    peer.dispose();
  });
  it('rejects requests immediately after server failure instead of waiting for a timeout', async () => {
    const { peer, child } = fixture();
    child.emit('error', new Error('Spawn failed'));
    await expect(peer.request('initialize')).rejects.toThrow('not running');
    peer.dispose();
  });
});

describe('native process failures', () => {
  it('caps stderr as well as stdout and rejects output overflow', async () => {
    const workspace = new Workspaces({}, () => null);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
    Object.assign(workspace, { spawn: () => child });
    const pending = workspace.execute('fixture', [], { id: 'root', name: 'root', key: 'root', path: base, kind: 'local', prefix: '' });
    child.stderr.emit('data', Buffer.alloc(4 * 1024 * 1024 + 1));
    child.emit('close', 0);
    await expect(pending).rejects.toThrow('output exceeds');
    expect(child.kill).toHaveBeenCalledOnce();
  });
  it('tolerates a null extension-state record and reports broken host IPC promptly', async () => {
    interface Extensions { states: Record<string, boolean>; initialize(): Promise<void>; list(): Promise<{ enabled: boolean }[]>; run(id: string, command: string, context: unknown): Promise<unknown>; hosts: Map<string, unknown>; pending: Map<string, unknown> }
    const { Extensions } = require('../../electron/services/extensions.cjs') as { Extensions: new (...args: unknown[]) => Extensions };
    const fixture = await mkdtemp(path.join(base, '23-extension-state-'));
    await mkdir(path.join(fixture, 'extensions'));
    await writeFile(path.join(fixture, 'extensions/state.json'), 'null');
    await mkdir(path.join(fixture, 'extensions/test'));
    await writeFile(path.join(fixture, 'extensions/test/package.json'), JSON.stringify({ main: 'must-not-run.cjs' }));
    const extensions = new Extensions({ getPath: () => fixture }, {}, () => {});
    await extensions.initialize();
    expect(extensions.states).toEqual({});
    expect((await extensions.list())[0].enabled).toBe(false);
    expect(extensions.hosts.size).toBe(0);
    extensions.hosts.set('test', { commands: ['command'], child: { send: (_: unknown, callback: (error: Error) => void) => callback(new Error('IPC closed')) } });
    await expect(extensions.run('test', 'command', {})).rejects.toThrow('IPC closed');
    expect(extensions.pending.size).toBe(0);
  });
  it('blocks duplicate debugger starts while configuration/approval is pending', async () => {
    interface Debugger { start(name: string): Promise<unknown> }
    const { DebuggerService } = require('../../electron/services/debugger.cjs') as { DebuggerService: new (...args: unknown[]) => Debugger };
    let release!: (value: unknown) => void;
    const service = new DebuggerService({ config: () => new Promise(resolve => { release = resolve; }) }, () => {});
    const first = service.start('missing');
    await expect(service.start('missing')).rejects.toThrow('current debug session');
    release({ configurations: [] });
    await expect(first).rejects.toThrow('not found');
  });
});

describe('language-server synchronization', () => {
  interface Session { rootId: string; languages: string[]; documents: Map<string, unknown>; capabilities: { textDocumentSync: unknown }; peer: { notify: ReturnType<typeof vi.fn> } }
  interface Languages { sessions: Map<string, Session>; document(id: string, document: { path: string; text: string; language: string }): string }
  const { Languages } = require('../../electron/services/languages.cjs') as { Languages: new (...args: unknown[]) => Languages };
  it('uses a replacement range for incremental servers, with UTF-16 and CRLF positions', () => {
    const languages = new Languages({ locate: () => ({ context: { id: 'root' } }), uri: () => 'file:///test.py' }, {}, () => {});
    const notify = vi.fn();
    languages.sessions.set('lsp', { rootId: 'root', languages: ['python'], documents: new Map(), capabilities: { textDocumentSync: { change: 2 } }, peer: { notify } });
    languages.document('lsp', { path: 'test.py', text: 'first\r\n😀x', language: 'python' });
    languages.document('lsp', { path: 'test.py', text: 'new', language: 'python' });
    expect(notify).toHaveBeenLastCalledWith('textDocument/didChange', { textDocument: { uri: 'file:///test.py', version: 2 }, contentChanges: [{ range: { start: { line: 0, character: 0 }, end: { line: 1, character: 3 } }, text: 'new' }] });
  });
  it('does not send changes to servers that explicitly disable synchronization', () => {
    const languages = new Languages({ locate: () => ({ context: { id: 'root' } }), uri: () => 'file:///test.py' }, {}, () => {});
    const notify = vi.fn();
    languages.sessions.set('lsp', { rootId: 'root', languages: ['python'], documents: new Map(), capabilities: { textDocumentSync: 0 }, peer: { notify } });
    languages.document('lsp', { path: 'test.py', text: 'old', language: 'python' });
    languages.document('lsp', { path: 'test.py', text: 'new', language: 'python' });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
