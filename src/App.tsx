import { useCallback, useEffect, useRef, useState } from 'react';
import { Blocks, Code2, Files, GitBranch, Search as SearchIcon, Settings as SettingsIcon, X, Bell, CheckCheck, PanelBottom, FileCode2, Bug, ListTodo, Languages, Monitor } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { Editor } from './components/Editor';
import { Toolbar } from './components/Toolbar';
import { Tabs } from './components/Tabs';
import { Explorer } from './components/Explorer';
import { Search } from './components/Search';
import { Settings } from './components/Settings';
import { Git } from './components/Git';
import { Panel } from './components/Panel';
import { Palette, type PaletteItem } from './components/Palette';
import { Extensions } from './components/Extensions';
import { Tasks } from './components/Tasks';
import { LanguageTools } from './components/LanguageTools';
import { Remote } from './components/Remote';
import { Debug } from './components/Debug';
import { startDebug } from './lib/debugActions';
import { InputDialog } from './components/InputDialog';
import { promptText, useInputDialog } from './store/inputDialogStore';
import { useEditorStore, type Sidebar } from './store/editorStore';
import { useCollaborationStore } from './store/collaborationStore';
import { binaryExtensions, isDirty, languageIds, MAX_FILE_SIZE, normalizePath } from './lib/files';
import { hasWorkspaceAccess, pickWorkspace, refreshWorkspace, removeWorkspaceFile, renameWorkspaceFile } from './lib/workspace';
import { monaco } from './lib/monaco';
import { useIdeStore } from './store/ideStore';
import { useIdeServices } from './lib/useIdeServices';

const commands: PaletteItem[] = [
  { id: 'new', label: 'File: New File', shortcut: 'Ctrl+N' },
  { id: 'open', label: 'File: Open Files…', shortcut: 'Ctrl+O' },
  { id: 'folder', label: 'File: Open Folder…' },
  { id: 'refresh', label: 'File: Refresh from Disk (keep unsaved edits)' },
  { id: 'save', label: 'File: Save', shortcut: 'Ctrl+S' },
  { id: 'saveAs', label: 'File: Save As / Export Copy…', shortcut: 'Ctrl+Shift+S' },
  { id: 'saveAll', label: 'File: Save All' },
  { id: 'rename', label: 'File: Rename', shortcut: 'F2' },
  { id: 'delete', label: 'File: Delete' },
  { id: 'close', label: 'File: Close Editor', shortcut: 'Ctrl+W' },
  { id: 'quickOpen', label: 'Go: Quick Open', shortcut: 'Ctrl+P' },
  { id: 'line', label: 'Go: Go to Line', shortcut: 'Ctrl+G' },
  { id: 'find', label: 'Edit: Find', shortcut: 'Ctrl+F' },
  { id: 'replace', label: 'Edit: Replace', shortcut: 'Ctrl+H' },
  { id: 'search', label: 'Search: Find in Workspace', shortcut: 'Ctrl+Shift+F' },
  { id: 'format', label: 'Edit: Format Document', shortcut: 'Shift+Alt+F' },
  { id: 'undo', label: 'Edit: Undo', shortcut: 'Ctrl+Z' },
  { id: 'redo', label: 'Edit: Redo', shortcut: 'Ctrl+Y' },
  { id: 'toggleSidebar', label: 'View: Toggle Sidebar', shortcut: 'Ctrl+B' },
  { id: 'togglePanel', label: 'View: Toggle Panel', shortcut: 'Ctrl+J' },
  { id: 'terminal', label: 'View: Interactive Terminal', shortcut: 'Ctrl+`' },
  { id: 'newTerminal', label: 'Terminal: New Interactive Terminal' },
  { id: 'split', label: 'View: Toggle Split Editor', shortcut: 'Ctrl+\\' },
  { id: 'addFolder', label: 'Workspace: Add Folder to Workspace' },
  { id: 'saveWorkspace', label: 'Workspace: Save Multi-root Workspace…' },
  { id: 'loadWorkspace', label: 'Workspace: Open Saved Workspace…' },
  { id: 'tasks', label: 'Tasks: Show Build and Test Tasks' },
  { id: 'languages', label: 'Language Servers: Manage' },
  { id: 'extensions', label: 'Extensions: Install and Manage Custom Extensions' },
  { id: 'remote', label: 'Remote: Connect to SSH, WSL, or Container' },
  { id: 'debug', label: 'Debug: Show Run and Debug' },
  { id: 'debugStart', label: 'Debug: Start or Continue', shortcut: 'F5' },
  { id: 'debugStop', label: 'Debug: Stop', shortcut: 'Shift+F5' },
  { id: 'breakpoint', label: 'Debug: Toggle Breakpoint', shortcut: 'F9' },
  { id: 'debugNext', label: 'Debug: Step Over', shortcut: 'F10' },
  { id: 'debugInto', label: 'Debug: Step Into', shortcut: 'F11' },
  { id: 'debugOut', label: 'Debug: Step Out', shortcut: 'Shift+F11' },
  { id: 'renameSymbol', label: 'Refactor: Rename Symbol', shortcut: 'F2' },
  { id: 'problems', label: 'View: Problems', shortcut: 'Ctrl+Shift+M' },
  { id: 'git', label: 'View: Source Control' },
  { id: 'settings', label: 'Preferences: Open Settings', shortcut: 'Ctrl+,' },
  { id: 'theme', label: 'Preferences: Toggle Color Theme' },
  { id: 'wrap', label: 'View: Toggle Word Wrap', shortcut: 'Alt+Z' },
  { id: 'preview', label: 'View: Toggle HTML Preview' },
];
const activities: { id: Sidebar; label: string; icon: typeof Files }[] = [
  { id: 'explorer', label: 'Explorer', icon: Files }, { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'git', label: 'Source Control', icon: GitBranch }, { id: 'extensions', label: 'Extensions & Collaboration', icon: Blocks },
  { id: 'debug', label: 'Run and Debug', icon: Bug }, { id: 'tasks', label: 'Build and Tasks', icon: ListTodo },
  { id: 'languages', label: 'Language Servers', icon: Languages }, { id: 'remote', label: 'Remote Workspaces', icon: Monitor },
];

function App() {
  useIdeServices();
  const state = useEditorStore();
  const selectedId = state.focusedGroup === 'secondary' ? state.secondaryId : state.activeId;
  const file = state.files.find(f => f.id === selectedId);
  const primaryFile = state.files.find(f => f.id === state.activeId);
  const secondaryFile = state.files.find(f => f.id === state.secondaryId);
  const extensionCommands = useIdeStore(state => state.extensionCommands);
  const input = useRef<HTMLInputElement>(null);
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [primaryInstance, setPrimaryInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [secondaryInstance, setSecondaryInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [palette, setPalette] = useState<'commands' | 'files' | null>(null);
  const [markers, setMarkers] = useState<editor.IMarker[]>([]);
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1, selected: 0 });
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [panelHeight, setPanelHeight] = useState(240);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const report = useCallback((error: unknown) => {
    if ((error as Error).name !== 'AbortError') useEditorStore.getState().setMessage((error as Error).message || String(error));
  }, []);
  const reveal = useCallback((id: string, line: number, column: number) => {
    useEditorStore.getState().openTab(id);
    // React must switch the Monaco model before revealing the result.
    setTimeout(() => {
      editorRef.current?.setPosition({ lineNumber: line, column });
      editorRef.current?.revealLineInCenter(line);
      editorRef.current?.focus();
    }, 80);
  }, []);
  const revealPath = useCallback((path: string, line = 1, column = 1) => {
    const found = useEditorStore.getState().files.find(f => f.path === path);
    if (found) reveal(found.id, line, column);
  }, [reveal]);
  const closeTab = useCallback((id: string) => {
    // Closing a tab never deletes its buffer. Unsaved text remains in the explorer and recovery.
    useEditorStore.getState().closeTab(id);
  }, []);
  const rename = useCallback(async (id: string) => {
    const store = useEditorStore.getState();
    const target = store.files.find(f => f.id === id);
    if (!target) return;
    const value = await promptText('Rename file (relative workspace path)', target.path);
    if (!value || value === target.path) return;
    try {
      const path = normalizePath(value);
      if (store.files.some(f => f.id !== id && f.path === path)) throw new Error('That file already exists.');
      if (store.workspaceLinked && target.savedContent !== '\0') {
        if (!hasWorkspaceAccess()) throw new Error('Reopen the folder before renaming a file on disk.');
        await renameWorkspaceFile(target.path, path, target.savedContent);
      }
      store.rename(id, path);
    } catch (error) { report(error); }
  }, [report]);
  const remove = useCallback(async (id: string) => {
    const store = useEditorStore.getState();
    const target = store.files.find(f => f.id === id);
    if (!target || !confirm(`Delete ${target.path}${store.workspaceLinked ? ' from disk' : ' from this workspace'}?${isDirty(target) ? '\nThis also discards unsaved changes.' : ''}\nThis cannot be undone.`)) return;
    try {
      if (store.workspaceLinked && target.savedContent !== '\0') await removeWorkspaceFile(target.path);
      store.remove(id);
    } catch (error) { report(error); }
  }, [report]);

  const command = useCallback(async (id: string) => {
    setPalette(null);
    document.querySelectorAll('details[open]').forEach(node => node.removeAttribute('open'));
    const store = useEditorStore.getState();
    const currentId = store.focusedGroup === 'secondary' ? store.secondaryId : store.activeId;
    const current = store.files.find(f => f.id === currentId);
    const ed = editorRef.current;
    try {
      const extension = useIdeStore.getState().extensionCommands.find(command => id === `extension/${command.extensionId}/${command.id}`);
      if (extension && current && window.desktop) {
        const result = await window.desktop.extensionRun(extension.extensionId, extension.id, { path: current.path, text: current.content, language: current.language });
        if (typeof result.text === 'string') {
          if (useEditorStore.getState().files.find(file => file.id === current.id)?.content !== current.content) throw new Error('The document changed while the extension ran. Its replacement was not applied.');
          if (ed?.getModel()?.uri.path === '/workspace/' + current.path) { ed.pushUndoStop(); ed.executeEdits('extension', [{ range: ed.getModel()!.getFullModelRange(), text: result.text }]); ed.pushUndoStop(); }
          else store.updateContent(current.id, result.text);
        }
        if (result.message) store.setMessage(result.message);
        return;
      }
      switch (id) {
        case 'new': { const root = store.roots.find(root => root.id === store.activeRootId); const path = await promptText('New file name (folders are allowed)', (root?.prefix ?? '') + 'untitled.js'); if (path) store.newFile(path); break; }
        case 'open': input.current?.click(); break;
        case 'folder': {
          if (store.files.some(isDirty) && !confirm('Opening a different folder replaces this workspace, including unsaved edits. Save them first. Reopening the same-named folder preserves unsaved edits. Continue?')) break;
          const result = await pickWorkspace();
          if (result) {
            useCollaborationStore.getState().disconnectCollaboration();
            const sameWorkspace = store.workspaceLinked && (result.key ? store.workspaceKey === result.key : store.workspaceName === result.name && confirm('Is this the original workspace folder? OK restores your buffers into it. Cancel opens it as a new workspace.'));
            if ('roots' in result) store.acceptWorkspace(result, sameWorkspace);
            else if (sameWorkspace) store.refreshFiles(result.files);
            else store.loadWorkspace(result.name, result.files, result.key);
            store.setMessage(`Opened ${result.name}: ${result.files.length} text files. ${result.skipped} large/binary files skipped; dependency/build folders excluded.`);
          }
          break;
        }
        case 'refresh': { if (window.desktop) store.acceptWorkspace(await window.desktop.refresh(), true); else store.refreshFiles((await refreshWorkspace()).files); store.setMessage('Refreshed from disk. Unsaved buffers were preserved.'); break; }
        case 'addFolder': { if (!window.desktop) throw new Error('Multiple roots require desktop mode.'); const result = await window.desktop.addFolder(); if (result) store.acceptWorkspace(result, true); break; }
        case 'saveWorkspace': if (window.desktop) await window.desktop.saveWorkspace(); break;
        case 'loadWorkspace': {
          if (!window.desktop) throw new Error('Saved workspace files require desktop mode.');
          if (store.files.some(isDirty) && !confirm('Opening a workspace replaces current buffers. Save unsaved changes first. Continue?')) break;
          const result = await window.desktop.loadWorkspace(); if (result) store.acceptWorkspace(result); break;
        }
        case 'save': await store.saveFile(); break;
        case 'saveAs': await store.saveFile(undefined, true); break;
        case 'saveAll': for (const target of store.files.filter(isDirty)) await store.saveFile(target.id); break;
        case 'rename': if (current) await rename(current.id); break;
        case 'delete': if (current) await remove(current.id); break;
        case 'close': if (current) closeTab(current.id); break;
        case 'quickOpen': setPalette('files'); break;
        case 'find': ed?.focus(); ed?.getAction('actions.find')?.run(); break;
        case 'replace': ed?.focus(); ed?.getAction('editor.action.startFindReplaceAction')?.run(); break;
        case 'line': ed?.focus(); ed?.getAction('editor.action.gotoLine')?.run(); break;
        case 'format': {
          const action = ed?.getAction('editor.action.formatDocument');
          if (action?.isSupported()) await action.run(); else store.setMessage('No formatter is available for this language. Built-in formatting supports JavaScript, TypeScript, JSON, HTML, and CSS.');
          break;
        }
        case 'undo': ed?.trigger('keyboard', 'undo', null); ed?.focus(); break;
        case 'redo': ed?.trigger('keyboard', 'redo', null); ed?.focus(); break;
        case 'search': store.setSidebar('search'); setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Search workspace"]')?.focus(), 50); break;
        case 'settings': store.setSidebar('settings'); break;
        case 'extensions': store.setSidebar('extensions'); break;
        case 'languages': store.setSidebar('languages'); break;
        case 'tasks': store.setSidebar('tasks'); break;
        case 'remote': store.setSidebar('remote'); break;
        case 'debug': store.setSidebar('debug'); break;
        case 'git': store.setSidebar('git'); break;
        case 'toggleSidebar': store.toggleSidebar(); break;
        case 'togglePanel': store.togglePanel(); break;
        case 'terminal': store.setPanel('terminal'); break;
        case 'newTerminal': {
          if (!window.desktop) throw new Error('Interactive terminals require desktop mode.');
          const terminal = await window.desktop.terminalCreate(); useIdeStore.getState().setTerminals(await window.desktop.terminalList()); useIdeStore.getState().setActiveTerminal(terminal.id); store.setPanel('terminal'); break;
        }
        case 'split': store.toggleSplit(); break;
        case 'debugStart': if (useIdeStore.getState().debugState === 'paused') await window.desktop?.debugRequest('continue'); else await startDebug(); break;
        case 'debugStop': await window.desktop?.debugStop(); break;
        case 'debugNext': await window.desktop?.debugRequest('next'); break;
        case 'debugInto': await window.desktop?.debugRequest('stepIn'); break;
        case 'debugOut': await window.desktop?.debugRequest('stepOut'); break;
        case 'breakpoint': if (current && ed?.getPosition()) useIdeStore.getState().toggleBreakpoint(current.path, ed.getPosition()!.lineNumber); break;
        case 'renameSymbol': ed?.focus(); await ed?.getAction('editor.action.rename')?.run(); break;
        case 'problems': store.setPanel('problems'); break;
        case 'theme': store.setSettings({ theme: store.settings.theme === 'light' ? 'vs-dark' : 'light' }); break;
        case 'wrap': store.setSettings({ wordWrap: store.settings.wordWrap === 'on' ? 'off' : 'on' }); break;
        case 'preview': if (current?.language === 'html') store.togglePreview(); else store.setMessage('HTML preview requires an HTML file. Preview is sandboxed and does not execute scripts.'); break;
      }
    } catch (error) { report(error); }
  }, [closeTab, remove, rename, report]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (useInputDialog.getState().request) return;
      const inTerminal = (event.target as HTMLElement)?.closest('.xterm');
      if (inTerminal && !(modifier && ((event.shiftKey && key === 'p') || key === 'j' || key === '`'))) return;
      const editable = (event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]');
      let id = '';
      if (key === 'f1' || (modifier && event.shiftKey && key === 'p')) { event.preventDefault(); setPalette('commands'); return; }
      if (palette) return;
      if (modifier && key === 's') id = event.shiftKey ? 'saveAs' : 'save';
      else if (modifier && key === 'p') id = 'quickOpen';
      else if (modifier && key === 'o') id = 'open';
      else if (modifier && key === 'n') id = 'new';
      else if (modifier && key === 'w') id = 'close';
      else if (modifier && event.shiftKey && key === 'f') id = 'search';
      else if (modifier && event.shiftKey && key === 'm') id = 'problems';
      else if (modifier && key === 'b') id = 'toggleSidebar';
      else if (modifier && key === 'j') id = 'togglePanel';
      else if (modifier && key === '`') id = 'terminal';
      else if (modifier && key === '\\') id = 'split';
      else if (key === 'f5') id = event.shiftKey ? 'debugStop' : 'debugStart';
      else if (key === 'f9') id = 'breakpoint';
      else if (key === 'f10') id = 'debugNext';
      else if (key === 'f11') id = event.shiftKey ? 'debugOut' : 'debugInto';
      else if (modifier && key === ',') id = 'settings';
      else if (event.altKey && key === 'z') id = 'wrap';
      else if (event.altKey && event.shiftKey && key === 'f') id = 'format';
      else if (!editable || (event.target as HTMLElement)?.closest('.monaco-editor')) {
        if (modifier && key === 'f') id = 'find';
        if (modifier && key === 'h') id = 'replace';
        if (modifier && key === 'g') id = 'line';
        if (key === 'f2') id = 'renameSymbol';
      }
      if (id) { event.preventDefault(); event.stopPropagation(); void command(id); }
      if (event.key === 'Escape') document.querySelectorAll('details[open]').forEach(node => node.removeAttribute('open'));
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [command, palette]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (useEditorStore.getState().files.some(isDirty)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    const refresh = () => setMarkers(monaco.editor.getModelMarkers({}).filter(m => m.resource.path.startsWith('/workspace/')));
    const listener = monaco.editor.onDidChangeMarkers(refresh);
    refresh();
    return () => listener.dispose();
  }, []);
  useEffect(() => {
    if (!instance) return;
    const listener = instance.onDidChangeCursorSelection(e => setCursor({ ...e.selection.getPosition(), selected: instance.getModel()?.getValueInRange(e.selection).length ?? 0 }));
    return () => listener.dispose();
  }, [instance]);
  useEffect(() => {
    if (!state.settings.autoSave || !state.workspaceLinked || !hasWorkspaceAccess()) return;
    const timer = setTimeout(() => { for (const target of useEditorStore.getState().files.filter(isDirty)) void useEditorStore.getState().saveFile(target.id); }, 1000);
    return () => clearTimeout(timer);
  }, [state.files, state.settings.autoSave, state.workspaceLinked]);
  useEffect(() => {
    document.title = `${file ? (isDirty(file) ? '● ' : '') + file.path + ' — ' : ''}23 Code Enterprise`;
  }, [file]);
  const mounted = useCallback((ed: editor.IStandaloneCodeEditor) => { editorRef.current = ed; setPrimaryInstance(ed); setInstance(ed); useEditorStore.getState().focusGroup('main'); ed.focus(); }, []);
  const mountedSecondary = useCallback((ed: editor.IStandaloneCodeEditor) => { editorRef.current = ed; setSecondaryInstance(ed); setInstance(ed); useEditorStore.getState().focusGroup('secondary'); ed.focus(); }, []);
  const focusMain = useCallback(() => { if (primaryInstance) { editorRef.current = primaryInstance; setInstance(primaryInstance); useEditorStore.getState().focusGroup('main'); } }, [primaryInstance]);
  const focusSecondary = useCallback(() => { if (secondaryInstance) { editorRef.current = secondaryInstance; setInstance(secondaryInstance); useEditorStore.getState().focusGroup('secondary'); } }, [secondaryInstance]);
  useEffect(() => {
    if (!state.splitOpen && primaryInstance) { editorRef.current = primaryInstance; setInstance(primaryInstance); }
  }, [state.splitOpen, primaryInstance]);
  useEffect(() => {
    const paths = new Set(state.files.map(file => '/workspace/' + file.path));
    const activeModels = new Set([primaryInstance?.getModel(), state.splitOpen ? secondaryInstance?.getModel() : null]);
    for (const model of monaco.editor.getModels()) if (model.uri.path.startsWith('/workspace/') && !paths.has(model.uri.path) && !activeModels.has(model)) model.dispose();
    for (const file of state.files) {
      const uri = monaco.Uri.from({ scheme: 'file', path: '/workspace/' + file.path });
      const model = monaco.editor.getModel(uri);
      if (!model) monaco.editor.createModel(file.content, file.language, uri);
      else if (!activeModels.has(model) && model.getValue() !== file.content) model.setValue(file.content);
    }
  }, [state.files, primaryInstance, secondaryInstance, state.splitOpen]);
  useEffect(() => {
    const opener = monaco.editor.registerEditorOpener({ openCodeEditor(_source, resource, selection) {
      const path = resource.path.replace(/^\/workspace\//, '');
      const target = useEditorStore.getState().files.find(file => file.path === path);
      if (!target) return false;
      const line = selection ? 'startLineNumber' in selection ? selection.startLineNumber : selection.lineNumber : 1;
      const column = selection ? 'startColumn' in selection ? selection.startColumn : selection.column : 1;
      reveal(target.id, line, column); return true;
    } });
    return () => opener.dispose();
  }, [reveal]);
  function startResize(event: React.PointerEvent, kind: 'sidebar' | 'panel') {
    event.preventDefault();
    const start = kind === 'sidebar' ? event.clientX : event.clientY;
    const size = kind === 'sidebar' ? sidebarWidth : panelHeight;
    const move = (e: PointerEvent) => {
      if (kind === 'sidebar') setSidebarWidth(Math.max(190, Math.min(550, size + e.clientX - start)));
      else setPanelHeight(Math.max(120, Math.min(window.innerHeight * 0.65, size - e.clientY + start)));
    };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  }
  const sidebarContent = state.sidebar === 'explorer' ? <Explorer command={id => void command(id)} rename={id => void rename(id)} remove={id => void remove(id)} />
    : state.sidebar === 'search' ? <Search reveal={reveal} /> : state.sidebar === 'settings' ? <Settings />
    : state.sidebar === 'git' ? <Git reveal={revealPath} />
    : state.sidebar === 'debug' ? <Debug reveal={revealPath} /> : state.sidebar === 'tasks' ? <Tasks /> : state.sidebar === 'languages' ? <LanguageTools /> : state.sidebar === 'remote' ? <Remote /> : <Extensions />;
  return <div className={`workbench ${state.settings.theme === 'light' ? 'light' : ''}`}>
    <Toolbar command={id => void command(id)} palette={() => setPalette('commands')} />
    <input ref={input} type="file" multiple hidden aria-label="Open local files" onChange={async e => {
      const selected = Array.from(e.target.files ?? []); e.target.value = '';
      try {
        const entries = [];
        let skipped = 0;
        for (const item of selected) {
          if (binaryExtensions.test(item.name) || item.size > MAX_FILE_SIZE) { skipped++; continue; }
          const content = await item.text();
          if (content.includes('\0')) { skipped++; continue; }
          entries.push({ path: item.name, content });
        }
        state.importFiles(entries);
        state.setMessage(`Opened ${entries.length} files. ${skipped} unsupported files skipped. Existing unsaved buffers are not overwritten.`);
      } catch (error) { report(error); }
    }} />
    <div className="workbench-body"><aside className="activity-bar" aria-label="Activity bar"><div>{activities.map(({ id, label, icon: Icon }) => <button key={id} className={state.sidebarOpen && state.sidebar === id ? 'active' : ''} title={label} aria-label={label} onClick={() => state.sidebarOpen && state.sidebar === id ? state.toggleSidebar() : state.setSidebar(id)}><Icon size={24} /></button>)}</div><button className={state.sidebarOpen && state.sidebar === 'settings' ? 'active' : ''} title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => state.setSidebar('settings')}><SettingsIcon size={24} /></button></aside>
      {state.sidebarOpen && <><aside className="sidebar" style={{ width: sidebarWidth }} aria-label={`${state.sidebar} sidebar`}>{sidebarContent}</aside><div className="resize-handle vertical" onPointerDown={e => startResize(e, 'sidebar')} /></>}
      <main className="main-area"><Tabs onClose={closeTab} />
        {primaryFile || (state.splitOpen && secondaryFile) ? <><div className="editor-row">
          <section className={`editor-group ${state.focusedGroup === 'main' ? 'focused' : ''}`} aria-label="Primary editor group" onMouseDown={focusMain}>
            <div className="breadcrumbs"><FileCode2 size={13} /><span>{primaryFile?.path ?? 'No file selected'}</span></div><div className="editor-container">{primaryFile ? <Editor fileId={state.activeId} onMount={mounted} editorInstance={primaryInstance} onFocus={focusMain} /> : <div className="empty-state">Open a file in this group.</div>}</div>
          </section>
          {state.splitOpen && <section className={`editor-group secondary ${state.focusedGroup === 'secondary' ? 'focused' : ''}`} aria-label="Secondary editor group" onMouseDown={focusSecondary}><div className="breadcrumbs"><FileCode2 size={13} /><span>{secondaryFile?.path ?? 'Choose a file from Explorer'}</span><button className="icon-button" aria-label="Close secondary editor" onClick={state.toggleSplit}><X size={13} /></button></div><div className="editor-container">{secondaryFile ? <Editor fileId={state.secondaryId} onMount={mountedSecondary} editorInstance={secondaryInstance} onFocus={focusSecondary} /> : <button className="empty-state" onClick={() => state.focusGroup('secondary')}>Select this group, then open a file.</button>}</div></section>}
          {state.preview && file?.language === 'html' && <div className="preview"><div className="preview-header">HTML PREVIEW · scripts disabled<button className="icon-button" aria-label="Close preview" onClick={state.togglePreview}><X size={14} /></button></div><iframe title="HTML preview" sandbox="" srcDoc={file.content} /></div>}
        </div></>
          : <div className="welcome"><Code2 size={95} strokeWidth={1} /><h1>23 Code Enterprise</h1><p>A familiar workspace. Your code, on your machine.</p><div className="welcome-actions"><button onClick={() => void command('new')}>New File <kbd>Ctrl+N</kbd></button><button onClick={() => void command('folder')}>Open Folder…</button><button onClick={() => void command('open')}>Open Files… <kbd>Ctrl+O</kbd></button><button onClick={() => setPalette('commands')}>Show All Commands <kbd>Ctrl+Shift+P</kbd></button></div></div>}
        <div className="panel-container" style={{ height: state.panelOpen ? panelHeight : 0 }}>{state.panelOpen && <div className="resize-handle horizontal" onPointerDown={e => startResize(e, 'panel')} />}<Panel markers={markers} reveal={revealPath} /></div>
      </main>
    </div>
    <footer className="statusbar"><div><span className="remote-indicator"><Code2 size={13} /></span><button onClick={() => state.setSidebar('git')}><GitBranch size={13} />{window.desktop ? 'Source Control' : 'Browser'}</button><button onClick={() => state.setPanel('problems')}><span>⊗ {markers.filter(m => m.severity === 8).length}</span><span>⚠ {markers.filter(m => m.severity !== 8).length}</span></button></div><div>{file && <><button onClick={() => void command('line')}>Ln {cursor.lineNumber}, Col {cursor.column}{cursor.selected ? ` (${cursor.selected} selected)` : ''}</button><button onClick={() => state.setSidebar('settings')}>Spaces: {state.settings.tabSize}</button><span>UTF-8</span><span>{file.content.includes('\r\n') ? 'CRLF' : 'LF'}</span><select aria-label="Language mode" value={file.language} onChange={e => state.setLanguage(file.id, e.target.value)}>{[...new Set([...languageIds, 'dockerfile', file.language])].sort().map(lang => <option key={lang}>{lang}</option>)}</select></>}<button title="Toggle panel" aria-label="Toggle bottom panel" onClick={state.togglePanel}><PanelBottom size={14} /></button><span title="Local recovery enabled"><CheckCheck size={14} /></span><button title="Notifications" aria-label="Notifications" onClick={() => state.setMessage('Session recovery is local to this device. Save writes files to disk; reopening a folder restores filesystem access.')}><Bell size={14} /></button></div></footer>
    {state.message && <div className="notification" role="status"><span>{state.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => state.setMessage('')}><X size={16} /></button></div>}
    {palette && <Palette mode={palette} items={palette === 'commands' ? [...commands, ...extensionCommands.map(command => ({ id: `extension/${command.extensionId}/${command.id}`, label: command.title, detail: command.extensionId }))] : state.files.map(f => ({ id: f.id, label: f.path.split('/').pop()!, detail: f.path }))} close={() => { setPalette(null); editorRef.current?.focus(); }} choose={id => { if (palette === 'commands') void command(id); else { state.openTab(id); setPalette(null); } }} />}
    <InputDialog />
  </div>;
}
export default App;
