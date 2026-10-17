import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDirty, languageFor, normalizePath } from '../../src/lib/files';

vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
vi.mock('../../src/lib/workspace', () => ({ hasWorkspaceAccess: vi.fn(() => true), writeWorkspaceFile: vi.fn(async () => {}), saveDownload: vi.fn(async () => {}) }));
const workspace = await import('../../src/lib/workspace');
const { useEditorStore } = await import('../../src/store/editorStore');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workspace.hasWorkspaceAccess).mockReturnValue(true);
  useEditorStore.setState({ files: [], tabs: [], activeId: null, secondaryId: null, splitOpen: false, focusedGroup: 'main', roots: [], activeRootId: '', workspaceLinked: false, workspaceName: 'Test', message: '' });
});
describe('file paths and languages', () => {
  it('infers common languages and safely normalizes relative paths', () => {
    expect(languageFor('src/App.TSX')).toBe('typescript');
    expect(languageFor('Dockerfile')).toBe('dockerfile');
    expect(languageFor('LICENSE')).toBe('plaintext');
    expect(normalizePath('src\\main.ts')).toBe('src/main.ts');
  });
  it.each(['../secret', '/tmp/file', 'C:\\file', 'a//b', 'a/./b', 'a/../b', 'a\0b', 'a:b', '.GIT/config', 'a./b', 'CON.txt', 'nested/aux.js', 'LPT1'])('rejects unsafe path %s', path => {
    expect(() => normalizePath(path)).toThrow();
  });
});
describe('editor buffers', () => {
  it('creates unique files and refuses duplicate paths', () => {
    const a = useEditorStore.getState().newFile();
    const b = useEditorStore.getState().newFile();
    expect(a).not.toBe(b);
    expect(useEditorStore.getState().files.map(f => f.path)).toEqual(['untitled-1.txt', 'untitled-2.txt']);
    expect(() => useEditorStore.getState().newFile('untitled-1.txt')).toThrow();
  });
  it('switches and closes tabs without losing text or selecting the wrong buffer', () => {
    const a = useEditorStore.getState().newFile('a.ts');
    const b = useEditorStore.getState().newFile('b.ts');
    useEditorStore.getState().updateContent(a, 'const answer = 42;');
    useEditorStore.getState().closeTab(a);
    expect(useEditorStore.getState().activeId).toBe(b);
    useEditorStore.getState().closeTab(b);
    expect(useEditorStore.getState().activeId).toBeNull();
    useEditorStore.getState().openTab(a);
    expect(useEditorStore.getState().files.find(f => f.id === a)?.content).toBe('const answer = 42;');
  });
  it('preserves dirty files on import and refresh', () => {
    useEditorStore.getState().loadWorkspace('project', [{ path: 'a.ts', content: 'original' }, { path: 'b.ts', content: 'old' }]);
    const a = useEditorStore.getState().files[0];
    useEditorStore.getState().updateContent(a.id, 'unsaved');
    useEditorStore.getState().importFiles([{ path: 'a.ts', content: 'overwrite' }]);
    useEditorStore.getState().refreshFiles([{ path: 'a.ts', content: 'disk' }, { path: 'b.ts', content: 'new' }]);
    expect(useEditorStore.getState().files.find(f => f.path === 'a.ts')?.content).toBe('unsaved');
    expect(useEditorStore.getState().files.find(f => f.path === 'b.ts')?.content).toBe('new');
    expect(isDirty(useEditorStore.getState().files[0])).toBe(true);
  });
  it('does not mutate the previous snapshot while importing files', () => {
    useEditorStore.getState().importFiles([{ path: 'a.ts', content: 'old' }]);
    const previous = useEditorStore.getState().files[0];
    useEditorStore.getState().importFiles([{ path: 'a.ts', content: 'new' }]);
    expect(previous.content).toBe('old');
  });
  it('renames without losing content and rejects collisions', () => {
    const a = useEditorStore.getState().newFile('a.txt');
    useEditorStore.getState().newFile('b.txt');
    useEditorStore.getState().updateContent(a, 'keep me');
    useEditorStore.getState().rename(a, 'src/a.py');
    expect(useEditorStore.getState().files[0]).toMatchObject({ path: 'src/a.py', language: 'python', content: 'keep me' });
    expect(() => useEditorStore.getState().rename(a, 'b.txt')).toThrow();
  });
  it('keeps the right active tab when deleting another file', () => {
    const a = useEditorStore.getState().newFile('a.ts');
    const b = useEditorStore.getState().newFile('b.ts');
    useEditorStore.getState().remove(a);
    expect(useEditorStore.getState().activeId).toBe(b);
  });
  it('clamps invalid font and indentation settings', () => {
    useEditorStore.getState().setSettings({ fontSize: -100, tabSize: 100 });
    expect(useEditorStore.getState().settings.fontSize).toBe(10);
    expect(useEditorStore.getState().settings.tabSize).toBe(8);
  });
  it('routes selection and saves to the focused split without changing the primary selection', () => {
    const a = useEditorStore.getState().newFile('a.ts');
    const b = useEditorStore.getState().newFile('b.ts');
    useEditorStore.getState().openTab(a);
    useEditorStore.getState().toggleSplit();
    useEditorStore.getState().focusGroup('secondary');
    useEditorStore.getState().openTab(b);
    expect(useEditorStore.getState()).toMatchObject({ activeId: a, secondaryId: b, focusedGroup: 'secondary' });
    useEditorStore.getState().toggleSplit();
    expect(useEditorStore.getState()).toMatchObject({ activeId: a, secondaryId: null, focusedGroup: 'main', splitOpen: false });
  });
  it('refresh removes missing clean files but keeps deleted dirty buffers recoverable', () => {
    useEditorStore.getState().loadWorkspace('test', [{ path: 'clean.ts', content: '' }, { path: 'dirty.ts', content: 'old' }]);
    const dirty = useEditorStore.getState().files.find(f => f.path === 'dirty.ts')!;
    useEditorStore.getState().updateContent(dirty.id, 'recover me');
    useEditorStore.getState().refreshFiles([]);
    expect(useEditorStore.getState().files.map(f => f.path)).toEqual(['dirty.ts']);
  });
});

describe('saving and conflicts', () => {
  it('queues repeated saves and uses the completed save as the next disk baseline', async () => {
    useEditorStore.getState().loadWorkspace('test', [{ path: 'a.ts', content: 'original' }]);
    const id = useEditorStore.getState().activeId!;
    useEditorStore.getState().updateContent(id, 'first');
    let finish!: () => void;
    vi.mocked(workspace.writeWorkspaceFile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = useEditorStore.getState().saveFile();
    useEditorStore.getState().updateContent(id, 'second');
    const second = useEditorStore.getState().saveFile();
    expect(workspace.writeWorkspaceFile).toHaveBeenCalledTimes(1);
    finish(); await Promise.all([first, second]);
    expect(workspace.writeWorkspaceFile).toHaveBeenLastCalledWith('a.ts', 'second', 'first');
    expect(useEditorStore.getState().files[0]).toMatchObject({ content: 'second', savedContent: 'second' });
  });
  it('passes the original disk content to conflict checks and clears dirty only on success', async () => {
    useEditorStore.getState().loadWorkspace('test', [{ path: 'a.ts', content: 'original' }]);
    const id = useEditorStore.getState().activeId!;
    useEditorStore.getState().updateContent(id, 'edited');
    await useEditorStore.getState().saveFile();
    expect(workspace.writeWorkspaceFile).toHaveBeenCalledWith('a.ts', 'edited', 'original');
    expect(isDirty(useEditorStore.getState().files[0])).toBe(false);
  });
  it('leaves the latest edit dirty when typing continues during a save', async () => {
    useEditorStore.getState().loadWorkspace('test', [{ path: 'a.ts', content: 'original' }]);
    const id = useEditorStore.getState().activeId!;
    useEditorStore.getState().updateContent(id, 'snapshot');
    let finish!: () => void;
    vi.mocked(workspace.writeWorkspaceFile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = useEditorStore.getState().saveFile();
    useEditorStore.getState().updateContent(id, 'newer edit');
    finish(); await pending;
    expect(useEditorStore.getState().files[0]).toMatchObject({ content: 'newer edit', savedContent: 'snapshot' });
    expect(isDirty(useEditorStore.getState().files[0])).toBe(true);
  });
  it('reports failures without marking data saved', async () => {
    const id = useEditorStore.getState().newFile('a.ts');
    useEditorStore.setState({ workspaceLinked: true });
    vi.mocked(workspace.writeWorkspaceFile).mockRejectedValueOnce(new Error('File changed on disk'));
    await useEditorStore.getState().saveFile(id);
    expect(isDirty(useEditorStore.getState().files[0])).toBe(true);
    expect(useEditorStore.getState().message).toContain('File changed on disk');
  });
  it('exporting a copy does not clear dirty on the original linked file', async () => {
    useEditorStore.getState().newFile('a.ts');
    useEditorStore.setState({ workspaceLinked: true });
    await useEditorStore.getState().saveFile(undefined, true);
    expect(workspace.saveDownload).toHaveBeenCalled();
    expect(isDirty(useEditorStore.getState().files[0])).toBe(true);
  });
  it('requires reconnecting a recovered folder before disk writes', async () => {
    useEditorStore.getState().newFile('a.ts');
    useEditorStore.setState({ workspaceLinked: true });
    vi.mocked(workspace.hasWorkspaceAccess).mockReturnValue(false);
    await useEditorStore.getState().saveFile();
    expect(workspace.writeWorkspaceFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().message).toContain('Reopen the folder');
  });
});
