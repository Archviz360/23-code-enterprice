import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
interface Peer {
  request<T = unknown>(method: string, params?: unknown, timeout?: number): Promise<T>;
  dispose(): void;
}
const { FramedPeer } = require('../../electron/services/rpc.cjs') as { FramedPeer: new (child: ChildProcessWithoutNullStreams, protocol?: string) => Peer };
const temporary = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA!, 'Temp/opencode') : os.tmpdir();
const pythonCommand = process.env.PYTHON_EXECUTABLE ?? (process.platform === 'win32' ? 'py' : 'python3');
const pythonArgs = process.platform === 'win32' && !process.env.PYTHON_EXECUTABLE ? ['-3'] : [];
const pythonAvailable = spawnSync(pythonCommand, [...pythonArgs, '--version']).status === 0;

describe('framed remote filesystem protocol', () => {
  it.skipIf(!pythonAvailable)('uses real Python agent for reads, conflict checks, nested writes, renames, deletes and traversal rejection', async () => {
    const fixture = await mkdtemp(path.join(temporary, '23-remote-agent-'));
    await writeFile(path.join(fixture, 'unicode.txt'), 'héllo 世界\r\n');
    await mkdir(path.join(fixture, '.git'));
    await writeFile(path.join(fixture, '.git', 'config'), 'private');
    const child = spawn(pythonCommand, [...pythonArgs, '-u', path.resolve('electron/services/remote-agent.py'), fixture]);
    const peer = new FramedPeer(child);
    try {
      expect(await peer.request('read', { path: 'unicode.txt' })).toBe('héllo 世界\r\n');
      await expect(peer.request('read', { path: '../outside.txt' })).rejects.toThrow();
      await expect(peer.request('read', { path: '.git/config' })).rejects.toThrow();
      await expect(peer.request('write', { path: 'unicode.txt', content: 'bad', expected: 'wrong baseline' })).rejects.toThrow(/changed/);
      await peer.request('write', { path: 'nested/new.txt', content: 'created', expected: '\0' });
      await peer.request('rename', { path: 'nested/new.txt', to: 'nested/renamed.txt' });
      const snapshot = await peer.request<{ files: { path: string }[] }>('scan');
      expect(snapshot.files.map(file => file.path)).toContain('nested/renamed.txt');
      expect(snapshot.files.some(file => file.path.startsWith('.git'))).toBe(false);
      await peer.request('delete', { path: 'nested/renamed.txt' });
      await expect(peer.request('read', { path: 'nested/renamed.txt' })).rejects.toThrow();
    } finally { peer.dispose(); }
  });
});

describe('workspace command transport', () => {
  interface Context { id: string; name: string; key: string; prefix: string; kind: string; path: string; target: string }
  const { Workspaces, validateRelative } = require('../../electron/services/workspaces.cjs') as {
    Workspaces: new (dialog: unknown, getWindow: () => unknown) => { roots: Context[]; locate(path: string): unknown; spec(command: string, args: string[], context: Context, terminal?: boolean): { file: string; args: string[] }; connect(spec: unknown): Promise<unknown> };
    validateRelative(value: string): string;
  };
  it('constructs SSH, WSL and container transports without enabling a local shell', () => {
    const workspaces = new Workspaces({}, () => null);
    const base = { id: 'remote', name: 'test', key: 'test', prefix: '', path: '/project with spaces', target: 'test-target', kind: 'ssh' };
    const ssh = workspaces.spec('clangd', ['--log=error'], base);
    expect(ssh.file).toBe('ssh');
    expect(ssh.args).toContain('-oStrictHostKeyChecking=yes');
    expect(ssh.args).toContain('-oBatchMode=yes');
    expect(workspaces.spec('sh', ['-l'], { ...base, kind: 'wsl' }).file).toBe('wsl.exe');
    expect(workspaces.spec('sh', ['-l'], { ...base, kind: 'container' }, true).args.slice(0, 3)).toEqual(['exec', '-it', 'test-target']);
  });
  it('rejects hostile host names before spawning a connection', async () => {
    const workspaces = new Workspaces({}, () => null);
    await expect(workspaces.connect({ kind: 'ssh', target: '-oProxyCommand=bad', path: '/project' })).rejects.toThrow();
    await expect(workspaces.connect({ kind: 'ssh', target: 'host;bad', path: '/project' })).rejects.toThrow();
    await expect(workspaces.connect({ kind: 'wsl', target: 'Ubuntu', path: '../../outside' })).rejects.toThrow();
  });
  it('does not redirect buffers from a removed root into the default root', () => {
    const workspaces = new Workspaces({}, () => null);
    workspaces.roots = [{ id: 'first', name: 'first', key: 'first', prefix: '', path: 'C:/first', target: '', kind: 'local' }];
    expect(() => workspaces.locate('@abcdefabcdef/unsaved.txt')).toThrow(/no longer connected/);
    expect(() => workspaces.locate('ordinary.txt')).not.toThrow();
  });
  it.each(['../secret', 'folder/../secret', '/absolute', 'C:/outside', '.GIT/config', 'folder\\escape', 'name:stream', 'trailing.'])('rejects unsafe workspace path %s', value => {
    expect(() => validateRelative(value)).toThrow();
  });
});
