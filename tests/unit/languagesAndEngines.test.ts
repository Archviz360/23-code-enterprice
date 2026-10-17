import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bundledLanguages } from 'shiki/langs';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { detectLanguage, grammarFor, languageCatalog } from '../../src/lib/languageCatalog';
import { useLanguageStore } from '../../src/store/languageStore';
import type { EngineProfile, EngineProject } from '../../src/lib/types';
import { engineLanguages, godotDebug } from '../../src/lib/engineConfigurations';

const require = createRequire(import.meta.url);
const { buildCommand } = require('../../electron/services/engines.cjs') as { buildCommand(item: Partial<EngineProject>, profile: EngineProfile & { workspace: string }, action: string, platform?: string): { command: string; args: string[]; cwd: string } };
const { parseExternalArgs } = require('../../electron/services/external-editor.cjs') as { parseExternalArgs(args: string[], cwd?: string): { file: string; workspace?: string; line: number; column: number } | null };
const { connectTcp } = require('../../electron/services/tcp.cjs');
const { FramedPeer } = require('../../electron/services/rpc.cjs');

describe('offline language coverage', () => {
  it('has unique IDs, modern and early language definitions, and valid bundled grammar mappings', () => {
    expect(languageCatalog.length).toBe(842);
    expect(new Set(languageCatalog.map(language => language.id)).size).toBe(languageCatalog.length);
    for (const id of ['fortran', 'cobol', 'common-lisp', 'algol', 'assembly', 'plankalkul', 'short-code', 'autocode', 'flow-matic', 'gdscript', 'csharp', 'cpp']) {
      // Linguist names Assembly's canonical mode asm.
      expect(languageCatalog.some(language => language.id === (id === 'assembly' ? 'asm' : id)), id).toBe(true);
    }
    for (const language of languageCatalog) {
      const grammar = grammarFor(language);
      if (grammar) expect(grammar in bundledLanguages, `${language.name}: ${grammar}`).toBe(true);
    }
  });
  it.each([
    ['hello.FOR', 'fortran'], ['hello.f90', 'fortran-free-form'], ['hello.cob', 'cobol'], ['hello.lisp', 'common-lisp'],
    ['hello.gd', 'gdscript'], ['hello.cs', 'csharp'], ['hello.cpp', 'cpp'], ['test.tsx', 'typescript'],
    ['Demo.uproject', 'json'], ['project.godot', 'godot-resource'], ['scene.tscn', 'ini'], ['Shader.usf', 'hlsl'], ['Dockerfile', 'dockerfile'],
    ['unknown.nothing', 'plaintext'], ['C:\\game\\main.py', 'python'],
  ])('detects %s as %s', (file, language) => { expect(detectLanguage(file)).toBe(language); });
  it('detects extensionless scripts and supports explicit custom associations', () => {
    expect(detectLanguage('script', '#!/usr/bin/env python3\nprint(1)')).toBe('python');
    const custom = [{ id: 'my-dialect', name: 'My dialect', extensions: ['.mine'] }];
    expect(detectLanguage('test.mine', '', custom)).toBe('my-dialect');
    expect(detectLanguage('test.cpp', '', custom, { '.cpp': 'my-dialect' })).toBe('my-dialect');
  });
  it('rejects invalid custom language IDs, extensions, and executable/oversized grammar input', () => {
    const store = useLanguageStore.getState();
    expect(() => store.add('../escape', 'Bad', ['.x'])).toThrow();
    expect(() => store.add('custom-test', 'Test', ['bad'])).toThrow();
    expect(() => store.grammar('fortran', 'module.exports = {}')).toThrow();
    expect(() => store.grammar('fortran', '{}')).toThrow();
    expect(() => store.grammar('fortran', ' '.repeat(128 * 1024 + 1))).toThrow();
  });
  it('tokenizes early and game languages offline with the CSP-compatible JavaScript regex engine', async () => {
    const core = await createHighlighterCore({ themes: [], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) });
    try {
      for (const [grammar, line] of [['fortran-fixed-form', '      PROGRAM HELLO'], ['cobol', '       IDENTIFICATION DIVISION.'], ['gdscript', 'extends Node2D']] as const) {
        await core.loadLanguage(await bundledLanguages[grammar]());
        const result = core.getLanguage(grammar).tokenizeLine(line, null, 100);
        expect(result.tokens.length).toBeGreaterThan(1);
        expect(result.tokens.some(token => token.scopes.length > 1)).toBe(true);
      }
    } finally { core.dispose(); }
  });
});

describe('game-engine command construction', () => {
  const workspace = path.resolve('test workspace');
  const unreal = { kind: 'unreal', name: 'MyGame', file: 'My Game/MyGame.uproject', folder: path.join(workspace, 'My Game') } as const;
  it('keeps Unreal paths as separate arguments and chooses build/project-generation tools', () => {
    const profile = { workspace, executable: 'UnrealEditor.exe', engineRoot: 'C:/Epic/UE_5.6' };
    const open = buildCommand(unreal, profile, 'open', 'win32');
    expect(open.args).toEqual([path.join(workspace, unreal.file)]);
    const build = buildCommand(unreal, profile, 'build', 'win32');
    expect(build.command.replaceAll('\\', '/')).toContain('Engine/Build/BatchFiles/Build.bat');
    expect(build.args.slice(0, 3)).toEqual(['MyGameEditor', 'Win64', 'Development']);
    expect(buildCommand(unreal, profile, 'compilationDatabase', 'win32').args).toContain('-Mode=GenerateClangDatabase');
    expect(buildCommand(unreal, profile, 'projectFiles', 'win32').args).toContain('-ProjectFiles');
  });
  it('constructs Unity batch builds/tests and rejects pretend Play mode commands', () => {
    const project = { kind: 'unity', folder: workspace } as const;
    expect(buildCommand(project, { workspace, executable: 'Unity.exe' }, 'build').args).toContain('Code23Build.BuildWindows64');
    expect(buildCommand(project, { workspace, executable: 'Unity.exe' }, 'test').args).toContain('-runTests');
    expect(() => buildCommand(project, { workspace, executable: 'Unity.exe' }, 'run')).toThrow(/Play mode/);
  });
  it('requires a Godot export preset and prevents outputs outside the project', () => {
    const project = { kind: 'godot', folder: workspace } as const;
    expect(() => buildCommand(project, { workspace, executable: 'godot.exe' }, 'export')).toThrow(/preset/);
    expect(() => buildCommand(project, { workspace, executable: 'godot.exe', exportPreset: 'Windows', output: '../escape.exe' }, 'export')).toThrow();
    const spec = buildCommand(project, { workspace, executable: 'godot.exe', exportPreset: 'Windows' }, 'export');
    expect(spec.args).toContain('--export-release');
    expect(spec.args.at(-1)).toBe(path.join(workspace, 'build/game.exe'));
  });
  it('expands custom engine actions without a shell', () => {
    const result = buildCommand({ kind: 'custom', folder: workspace }, { workspace, actions: { build: { command: 'custom-tool', args: ['${projectFolder}', 'a;echo not-a-command'] } } }, 'build');
    expect(result.args).toEqual([workspace, 'a;echo not-a-command']);
    expect(() => buildCommand({ kind: 'custom', folder: workspace }, { workspace }, 'build')).toThrow(/Configure actions/);
  });
  it('scopes nested Godot LSP and debug profiles to the detected project', () => {
    const project = { kind: 'godot', file: 'games/Demo/project.godot' } as EngineProject;
    expect(engineLanguages(project).servers[0].root).toBe('${workspaceFolder}/games/Demo');
    expect(godotDebug(project).configurations[0].project).toBe('${workspaceFolder}/games/Demo');
  });
});

describe('external-editor and TCP boundaries', () => {
  const { Workspaces } = require('../../electron/services/workspaces.cjs');
  const { ExternalEditor } = require('../../electron/services/external-editor.cjs');
  async function fixture() {
    const temporary = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA!, 'Temp/opencode') : os.tmpdir();
    const folder = await mkdtemp(path.join(temporary, '23-external-editor-'));
    await writeFile(path.join(folder, 'main.cpp'), 'int value = 42;\n');
    const workspaces = new Workspaces({}, () => null);
    const external = new ExternalEditor(workspaces, () => {}, { replace() {}, select() {}, replaced() {} });
    return { folder, workspaces, external };
  }
  it('requires explicit workspace replacement consent, then opens only the requested source text', async () => {
    const { folder, workspaces, external } = await fixture();
    external.enqueue(['--workspace', folder, '--open-file', path.join(folder, 'main.cpp'), '--line', '1', '--column', '5']);
    const [request] = await external.pending();
    expect(request.replacesWorkspace).toBe(true);
    await expect(external.accept(request.id, false)).rejects.toThrow(/Confirm/);
    expect(workspaces.roots).toHaveLength(0);
    const result = await external.accept(request.id, true);
    expect(result.snapshot.files).toContainEqual({ path: 'main.cpp', content: 'int value = 42;\n' });
    expect(result.column).toBe(5);
    expect(await external.pending()).toEqual([]);
  });
  it('rejects files outside the explicitly requested workspace without replacing any roots', async () => {
    const { folder, workspaces, external } = await fixture();
    await mkdir(path.join(folder, 'nested'));
    external.enqueue(['--workspace', path.join(folder, 'nested'), '--open-file', path.join(folder, 'main.cpp')]);
    const [request] = await external.pending();
    expect(request.error).toMatch(/inside/);
    await expect(external.accept(request.id, true)).rejects.toThrow(/inside/);
    expect(workspaces.roots).toHaveLength(0);
  });
  it('enforces binary, size and protected Git path checks on external requests', async () => {
    const { folder, workspaces, external } = await fixture();
    await mkdir(path.join(folder, '.git'));
    await writeFile(path.join(folder, '.git/config'), 'protected');
    await writeFile(path.join(folder, 'asset.uasset'), Buffer.from([0, 1, 2]));
    await writeFile(path.join(folder, 'huge.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
    for (const [file, message] of [['.git/config', /Invalid/], ['asset.uasset', /Binary/], ['huge.txt', /2 MiB/]] as const) {
      external.enqueue(['--workspace', folder, '--open-file', path.join(folder, file)]);
      const request = (await external.pending()).at(-1);
      await expect(external.accept(request.id, true)).rejects.toThrow(message);
      expect(workspaces.roots).toHaveLength(0);
      external.reject(request.id);
    }
  });
  it('parses spaced filenames, coordinates and workspace flags without evaluating arguments', () => {
    const result = parseExternalArgs(['editor.exe', '--workspace', 'My Game', '--open-file', 'My Game/main.cpp', '--line', '23', '--column=7'], process.cwd());
    expect(result?.file).toBe(path.resolve('My Game/main.cpp'));
    expect(result?.line).toBe(23); expect(result?.column).toBe(7);
    expect(parseExternalArgs(['--line', '2'])).toBeNull();
    expect(parseExternalArgs(['--open-file', 'main.cpp', '--line', '-1'])?.line).toBe(1);
  });
  it('rejects non-loopback, invalid ports and remote contexts', async () => {
    await expect(connectTcp({ host: 'example.com', port: 6005 }, { kind: 'local' })).rejects.toThrow(/loopback/);
    await expect(connectTcp({ port: 0 }, { kind: 'local' })).rejects.toThrow();
    await expect(connectTcp({ port: 6005 }, { kind: 'ssh' })).rejects.toThrow();
  });
  it('carries framed Unicode LSP and DAP requests over real loopback sockets', async () => {
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      let buffer = Buffer.alloc(0);
      socket.on('data', data => {
        buffer = Buffer.concat([buffer, data]);
        const boundary = buffer.indexOf('\r\n\r\n');
        if (boundary < 0) return;
        const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, boundary).toString())![1]);
        if (buffer.length < boundary + 4 + length) return;
        const message = JSON.parse(buffer.subarray(boundary + 4, boundary + 4 + length).toString());
        buffer = buffer.subarray(boundary + 4 + length);
        const result = { value: 'Godot 世界', method: message.method ?? message.command };
        const body = Buffer.from(JSON.stringify(message.type === 'request' ? { type: 'response', request_seq: message.seq, success: true, body: result } : { jsonrpc: '2.0', id: message.id, result }));
        socket.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      for (const protocol of ['lsp', 'dap']) {
        const peer = new FramedPeer(await connectTcp({ port }, { kind: 'local' }), protocol);
        try { expect(await peer.request('initialize', {})).toEqual({ value: 'Godot 世界', method: 'initialize' }); }
        finally { peer.dispose(); }
      }
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
