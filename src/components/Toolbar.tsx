import { Code2, PanelBottom, PanelLeft, Search } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
export function Toolbar({ command, palette }: { command: (id: string) => void; palette: () => void }) {
  const { workspaceName, toggleSidebar, togglePanel } = useEditorStore();
  return <header className="titlebar">
    <Code2 className="brand" size={23} />
    <nav aria-label="Main menu">
      <details><summary>File</summary><div className="menu">
        <button onClick={() => command('new')}>New File <kbd>Ctrl+N</kbd></button>
        <button onClick={() => command('open')}>Open Files… <kbd>Ctrl+O</kbd></button>
        <button onClick={() => command('folder')}>Open Folder…</button><hr />
        <button onClick={() => command('addFolder')}>Add Folder to Workspace…</button>
        <button onClick={() => command('loadWorkspace')}>Open Workspace…</button>
        <button onClick={() => command('saveWorkspace')}>Save Workspace As…</button><hr />
        <button onClick={() => command('save')}>Save <kbd>Ctrl+S</kbd></button>
        <button onClick={() => command('saveAs')}>Save As… <kbd>Ctrl+Shift+S</kbd></button>
        <button onClick={() => command('saveAll')}>Save All</button><hr />
        <button onClick={() => command('close')}>Close Editor <kbd>Ctrl+W</kbd></button>
      </div></details>
      <details><summary>Edit</summary><div className="menu">
        <button onClick={() => command('undo')}>Undo <kbd>Ctrl+Z</kbd></button>
        <button onClick={() => command('redo')}>Redo <kbd>Ctrl+Y</kbd></button><hr />
        <button onClick={() => command('find')}>Find <kbd>Ctrl+F</kbd></button>
        <button onClick={() => command('replace')}>Replace <kbd>Ctrl+H</kbd></button>
        <button onClick={() => command('format')}>Format Document <kbd>Shift+Alt+F</kbd></button>
      </div></details>
      <details><summary>View</summary><div className="menu">
        <button onClick={palette}>Command Palette <kbd>F1</kbd></button>
        <button onClick={toggleSidebar}>Toggle Sidebar <kbd>Ctrl+B</kbd></button>
        <button onClick={togglePanel}>Toggle Panel <kbd>Ctrl+J</kbd></button>
        <button onClick={() => command('preview')}>Preview HTML</button>
        <button onClick={() => command('split')}>Split Editor <kbd>Ctrl+\</kbd></button>
        <button onClick={() => command('terminal')}>Interactive Terminal</button>
        <button onClick={() => command('debug')}>Run and Debug</button>
        <button onClick={() => command('tasks')}>Build and Tasks</button>
        <button onClick={() => command('languages')}>Language Servers</button>
        <button onClick={() => command('remote')}>Remote Workspaces</button>
        <button onClick={() => command('settings')}>Settings <kbd>Ctrl+,</kbd></button>
      </div></details>
    </nav>
    <button className="command-center" onClick={palette}><Search size={14} /><span>{workspaceName} — 23 Code Enterprise</span><kbd>Ctrl+Shift+P</kbd></button>
    <button className="icon-button" onClick={toggleSidebar} title="Toggle Sidebar (Ctrl+B)" aria-label="Toggle sidebar"><PanelLeft size={17} /></button>
    <button className="icon-button" onClick={togglePanel} title="Toggle Panel (Ctrl+J)" aria-label="Toggle panel"><PanelBottom size={17} /></button>
  </header>;
}
