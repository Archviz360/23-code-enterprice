import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isDirty, languageFor, normalizePath } from '../lib/files';
import type { FileEntry, WorkspaceFile, WorkspaceRoot, WorkspaceSnapshot } from '../lib/types';
import { hasWorkspaceAccess, writeWorkspaceFile, saveDownload } from '../lib/workspace';

export type Sidebar = 'explorer' | 'search' | 'git' | 'settings' | 'extensions' | 'debug' | 'tasks' | 'languages' | 'remote' | 'ai' | 'engines';
export interface Settings {
  theme: string; fontSize: number; tabSize: number;
  wordWrap: 'on' | 'off'; minimap: boolean; lineNumbers: boolean; autoSave: boolean;
}
interface EditorState {
  files: WorkspaceFile[]; tabs: string[]; activeId: string | null;
  secondaryId: string | null; splitOpen: boolean; focusedGroup: 'main' | 'secondary';
  roots: WorkspaceRoot[]; activeRootId: string;
  workspaceName: string; workspaceKey: string; workspaceLinked: boolean;
  settings: Settings; sidebar: Sidebar; sidebarOpen: boolean;
  panelOpen: boolean; panel: 'problems' | 'terminal' | 'output';
  message: string; output: string; preview: boolean;
  setMessage: (message: string) => void;
  setSettings: (value: Partial<Settings>) => void;
  setSidebar: (sidebar: Sidebar) => void;
  toggleSidebar: () => void;
  setPanel: (panel: EditorState['panel']) => void;
  togglePanel: () => void;
  setOutput: (output: string) => void;
  togglePreview: () => void;
  toggleSplit: () => void;
  focusGroup: (group: 'main' | 'secondary') => void;
  acceptWorkspace: (snapshot: WorkspaceSnapshot, preserve?: boolean) => void;
  selectRoot: (id: string) => Promise<void>;
  newFile: (path?: string) => string;
  importFiles: (entries: FileEntry[]) => void;
  loadWorkspace: (name: string, entries: FileEntry[], key?: string) => void;
  refreshFiles: (entries: FileEntry[]) => void;
  updateContent: (id: string, content: string) => void;
  setLanguage: (id: string, language: string) => void;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  rename: (id: string, path: string) => void;
  remove: (id: string) => void;
  saveFile: (id?: string, saveAs?: boolean) => Promise<void>;
}
function makeFile(entry: FileEntry): WorkspaceFile {
  return { ...entry, id: crypto.randomUUID(), savedContent: entry.content, language: languageFor(entry.path, entry.content) };
}
const welcome = makeFile({ path: 'welcome.md', content: '# Welcome to 23 Code Enterprise\n\nA local-first code editor for your projects.\n\n- Open a folder to edit real files.\n- Ctrl+Shift+P opens the command palette.\n- Ctrl+P switches files.\n- Ctrl+S saves; Ctrl+F finds; Ctrl+H replaces.\n- Ctrl+Shift+F searches your workspace.\n- F1 shows commands; F2 renames the active file.\n\nUse the desktop app for Git and shell commands.\nBrowser sessions are recovered locally, but recovery is not a disk save.\n' });
let recoveryWarningShown = false;
const saves = new Map<string, Promise<void>>();
const storage = createJSONStorage(() => ({
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    try { localStorage.setItem(name, value); recoveryWarningShown = false; }
    catch {
      if (!recoveryWarningShown) {
        recoveryWarningShown = true;
        queueMicrotask(() => useEditorStore.setState({ message: 'Session recovery storage is full. Save your files to disk; the latest changes cannot be recovered after closing.' }));
      }
    }
  },
  removeItem: (name: string) => localStorage.removeItem(name),
}));

export const useEditorStore = create<EditorState>()(persist((set, get) => ({
  files: [welcome], tabs: [welcome.id], activeId: welcome.id,
  secondaryId: null, splitOpen: false, focusedGroup: 'main', roots: [], activeRootId: '',
  workspaceName: 'Untitled workspace', workspaceKey: '', workspaceLinked: false,
  settings: { theme: 'vs-dark', fontSize: 14, tabSize: 2, wordWrap: 'off', minimap: true, lineNumbers: true, autoSave: false },
  sidebar: 'explorer', sidebarOpen: true, panelOpen: false, panel: 'problems',
  message: '', output: '', preview: false,
  setMessage: message => set({ message }),
  setSettings: value => set(state => ({ settings: { ...state.settings, ...value,
    fontSize: Math.min(40, Math.max(10, value.fontSize || state.settings.fontSize)),
    tabSize: Math.min(8, Math.max(1, value.tabSize || state.settings.tabSize)),
  } })),
  setSidebar: sidebar => set({ sidebar, sidebarOpen: true }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  setPanel: panel => set({ panel, panelOpen: true }),
  togglePanel: () => set(state => ({ panelOpen: !state.panelOpen })),
  setOutput: output => set({ output, panel: 'output', panelOpen: true }),
  togglePreview: () => set(state => ({ preview: !state.preview })),
  toggleSplit: () => set(state => ({ splitOpen: !state.splitOpen, secondaryId: state.splitOpen ? null : state.tabs.find(id => id !== state.activeId) ?? state.activeId, focusedGroup: 'main' })),
  focusGroup: focusedGroup => set({ focusedGroup }),
  acceptWorkspace: (snapshot, preserve = false) => {
    if (preserve) get().refreshFiles(snapshot.files);
    else get().loadWorkspace(snapshot.name, snapshot.files, snapshot.key);
    set({ roots: snapshot.roots, activeRootId: snapshot.activeRootId, workspaceName: snapshot.name || 'Untitled workspace', workspaceKey: snapshot.key, workspaceLinked: snapshot.roots.length > 0 });
  },
  selectRoot: async id => {
    if (!window.desktop) return;
    const result = await window.desktop.selectRoot(id);
    set({ roots: result.roots, activeRootId: result.activeRootId });
  },
  newFile: (value) => {
    const state = get();
    let n = 1;
    while (state.files.some(f => f.path === `untitled-${n}.txt`)) n++;
    const path = normalizePath(value ?? `untitled-${n}.txt`);
    if (state.files.some(f => f.path === path)) throw new Error('A file with that path already exists.');
    const file = { ...makeFile({ path, content: '' }), savedContent: '\0' };
    set({ files: [...state.files, file], tabs: [...state.tabs, file.id], ...(state.focusedGroup === 'secondary' ? { secondaryId: file.id } : { activeId: file.id }) });
    return file.id;
  },
  importFiles: entries => set(state => {
    const files = state.files.map(f => ({ ...f }));
    const tabs = [...state.tabs];
    let activeId = state.activeId;
    for (const entry of entries) {
      const existing = files.find(f => f.path === entry.path);
      if (existing) {
        if (isDirty(existing)) continue;
        existing.content = entry.content;
        if (!state.workspaceLinked) existing.savedContent = entry.content;
        activeId = existing.id;
      } else {
        const file = { ...makeFile(entry), savedContent: state.workspaceLinked ? '\0' : entry.content };
        files.push(file);
        activeId = file.id;
      }
      if (activeId && !tabs.includes(activeId)) tabs.push(activeId);
    }
    return { files, tabs, activeId };
  }),
  loadWorkspace: (workspaceName, entries, workspaceKey = '') => {
    const files = entries.map(makeFile).sort((a, b) => a.path.localeCompare(b.path));
    const first = files.find(f => /(^|\/)readme\.md$/i.test(f.path)) ?? files[0];
    set({ workspaceName, workspaceKey, workspaceLinked: true, files, tabs: first ? [first.id] : [], activeId: first?.id ?? null, secondaryId: null, splitOpen: false, focusedGroup: 'main', roots: [], activeRootId: '' });
  },
  refreshFiles: entries => set(state => {
    const byPath = new Map(entries.map(e => [e.path, e]));
    const files = state.files.filter(f => byPath.has(f.path) || isDirty(f)).map(f => {
      const entry = byPath.get(f.path);
      byPath.delete(f.path);
      return entry && !isDirty(f) ? { ...f, content: entry.content, savedContent: entry.content } : f;
    });
    files.push(...[...byPath.values()].map(makeFile));
    const tabs = state.tabs.filter(id => files.some(f => f.id === id));
    return { files, tabs, activeId: tabs.includes(state.activeId ?? '') ? state.activeId : tabs[0] ?? null, secondaryId: tabs.includes(state.secondaryId ?? '') ? state.secondaryId : tabs[0] ?? null };
  }),
  updateContent: (id, content) => set(state => ({ files: state.files.map(f => f.id === id ? { ...f, content } : f) })),
  setLanguage: (id, language) => set(state => ({ files: state.files.map(f => f.id === id ? { ...f, language } : f) })),
  openTab: id => set(state => state.files.some(f => f.id === id) ? { ...(state.focusedGroup === 'secondary' ? { secondaryId: id } : { activeId: id }), tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id] } : {}),
  closeTab: id => set(state => {
    const index = state.tabs.indexOf(id);
    const tabs = state.tabs.filter(tab => tab !== id);
    return { tabs, activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)] ?? null : state.activeId, secondaryId: state.secondaryId === id ? tabs[Math.min(index, tabs.length - 1)] ?? null : state.secondaryId };
  }),
  rename: (id, value) => {
    const path = normalizePath(value);
    if (get().files.some(f => f.id !== id && f.path === path)) throw new Error('That file already exists.');
    set(state => ({ files: state.files.map(f => f.id === id ? { ...f, path, language: languageFor(path) } : f) }));
  },
  remove: id => { get().closeTab(id); set(state => ({ files: state.files.filter(f => f.id !== id) })); },
  saveFile: async (id, saveAs = false) => {
    const selected = id ?? (get().focusedGroup === 'secondary' ? get().secondaryId : get().activeId);
    if (!selected) return;
    const workspaceKey = get().workspaceKey;
    const save = async () => {
    const state = get();
    const file = state.files.find(f => f.id === selected);
    if (!file || state.workspaceKey !== workspaceKey) return;
    try {
      if (state.workspaceLinked && !saveAs) {
        if (!hasWorkspaceAccess()) throw new Error('Reopen the folder after restoring a session, or use Save As to export this file.');
        await writeWorkspaceFile(file.path, file.content, file.savedContent);
      } else await saveDownload(file.path, file.content);
      // Save As exports a copy; it must not mark the original workspace file as saved.
      if (!saveAs || !state.workspaceLinked) set(current => ({ files: current.files.map(f => f.id === file.id && f.path === file.path && current.workspaceKey === workspaceKey ? { ...f, savedContent: file.content } : f) }));
      set({ message: `Saved ${file.path}` });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') set({ message: `Save failed: ${(error as Error).message}` });
    }
    };
    const previous = saves.get(selected);
    const pending = previous ? previous.then(save) : save();
    saves.set(selected, pending);
    try { await pending; } finally { if (saves.get(selected) === pending) saves.delete(selected); }
  },
}), {
  name: '23-code-workspace-v1', storage,
  merge: (persisted, current) => {
    if (!persisted || typeof persisted !== 'object') return current;
    const value = persisted as Partial<EditorState>;
    const validFile = (file: WorkspaceFile) => file && typeof file === 'object' && ['id', 'path', 'content', 'savedContent', 'language'].every(key => typeof file[key as keyof WorkspaceFile] === 'string');
    const files = Array.isArray(value.files) ? value.files.filter(validFile).filter((file, index, all) => all.findIndex(other => other.id === file.id || other.path === file.path) === index) : current.files;
    const ids = new Set(files.map(file => file.id));
    const tabs = Array.isArray(value.tabs) ? [...new Set(value.tabs.filter(id => ids.has(id)))] : files.slice(0, 1).map(file => file.id);
    const selected = (id: string | null | undefined) => typeof id === 'string' && tabs.includes(id) ? id : tabs[0] ?? null;
    const settings = value.settings && typeof value.settings === 'object' ? value.settings : current.settings;
    const roots = Array.isArray(value.roots) ? value.roots.filter(root => root && ['id', 'name', 'key', 'prefix', 'location'].every(key => typeof root[key as keyof WorkspaceRoot] === 'string') && ['local', 'ssh', 'wsl', 'container'].includes(root.kind)) : [];
    return { ...current, files, tabs, activeId: selected(value.activeId), secondaryId: selected(value.secondaryId),
      splitOpen: value.splitOpen === true, focusedGroup: value.focusedGroup === 'secondary' ? 'secondary' : 'main', roots,
      activeRootId: roots.some(root => root.id === value.activeRootId) ? value.activeRootId! : roots[0]?.id ?? '',
      workspaceName: typeof value.workspaceName === 'string' ? value.workspaceName : current.workspaceName,
      workspaceKey: typeof value.workspaceKey === 'string' ? value.workspaceKey : '', workspaceLinked: value.workspaceLinked === true,
      settings: { ...current.settings,
        theme: typeof settings.theme === 'string' && (['vs-dark', 'light', 'vs', 'hc-black'].includes(settings.theme) || settings.theme.startsWith('extension:')) ? settings.theme : current.settings.theme,
        fontSize: Number.isFinite(settings.fontSize) ? Math.max(10, Math.min(40, settings.fontSize)) : current.settings.fontSize,
        tabSize: Number.isFinite(settings.tabSize) ? Math.max(1, Math.min(8, Math.round(settings.tabSize))) : current.settings.tabSize,
        wordWrap: settings.wordWrap === 'on' ? 'on' : 'off',
        ...Object.fromEntries(['minimap', 'lineNumbers', 'autoSave'].map(key => [key, typeof settings[key as keyof Settings] === 'boolean' ? settings[key as keyof Settings] : current.settings[key as keyof Settings]])),
      },
    };
  },
  partialize: state => ({ files: state.files, tabs: state.tabs, activeId: state.activeId, secondaryId: state.secondaryId, splitOpen: state.splitOpen, focusedGroup: state.focusedGroup, roots: state.roots, activeRootId: state.activeRootId, workspaceName: state.workspaceName, workspaceKey: state.workspaceKey, workspaceLinked: state.workspaceLinked, settings: state.settings }),
}));
