import { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FilePlus2, Folder, FolderOpen, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { isDirty } from '../lib/files';

interface Node { name: string; path: string; id?: string; children: Node[] }
export function Explorer({ command, rename, remove }: { command: (id: string) => void; rename: (id: string) => void; remove: (id: string) => void }) {
  const { files, activeId, secondaryId, focusedGroup, openTab, workspaceName, roots, activeRootId, selectRoot } = useEditorStore();
  const selectedId = focusedGroup === 'secondary' ? secondaryId : activeId;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree: Node = { name: '', path: '', children: [] };
  for (const file of files) {
    let node = tree;
    const parts = file.path.split('/');
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join('/');
      let child = node.children.find(n => n.path === path);
      if (!child) { child = { name, path, children: [], id: index === parts.length - 1 ? file.id : undefined }; node.children.push(child); }
      node = child;
    });
  }
  function render(node: Node, depth: number) {
    return [...node.children].sort((a, b) => Number(Boolean(a.id)) - Number(Boolean(b.id)) || a.name.localeCompare(b.name)).map(child => {
      const closed = collapsed.has(child.path);
      const root = roots.find(root => root.prefix.replace(/\/$/, '') === child.path);
      if (!child.id) return <div key={child.path}>
        <button className="tree-row" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => setCollapsed(previous => {
          const next = new Set(previous); if (next.has(child.path)) next.delete(child.path); else next.add(child.path); return next;
        })} aria-expanded={!closed}>{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{closed ? <Folder size={15} /> : <FolderOpen size={15} />}<span>{root?.name ?? child.name}</span></button>
        {!closed && render(child, depth + 1)}
      </div>;
      const file = files.find(f => f.id === child.id)!;
      return <div className={`tree-file ${selectedId === child.id ? 'selected' : ''}`} key={child.id}>
        <button className="tree-row" style={{ paddingLeft: 25 + depth * 14 }} title={child.path} onClick={() => openTab(child.id!)}><FileCode2 size={15} className="file-icon" /><span>{child.name}</span>{isDirty(file) && <span className="dirty">●</span>}</button>
        <div className="tree-actions"><button aria-label={`Rename ${child.path}`} onClick={() => rename(child.id!)}><Pencil size={12} /></button><button aria-label={`Delete ${child.path}`} onClick={() => remove(child.id!)}><Trash2 size={12} /></button></div>
      </div>;
    });
  }
  return <>
    <div className="sidebar-heading"><span>EXPLORER</span><div><button className="icon-button" aria-label="New file" title="New File" onClick={() => command('new')}><FilePlus2 size={16} /></button><button className="icon-button" title="Open Folder" aria-label="Open folder" onClick={() => command('folder')}><FolderOpen size={16} /></button><button className="icon-button" title="Refresh from Disk" aria-label="Refresh files" onClick={() => command('refresh')}><RefreshCw size={15} /></button></div></div>
    <div className="workspace-heading"><ChevronDown size={14} /><strong>{workspaceName.toUpperCase()}</strong></div>
    {roots.length > 0 && <select className="root-selector" aria-label="Active workspace root" value={activeRootId} onChange={event => void selectRoot(event.target.value).catch(error => useEditorStore.getState().setMessage(error.message))}>{roots.map(root => <option key={root.id} value={root.id}>{root.name} ({root.kind})</option>)}</select>}
    {window.desktop && <div className="workspace-actions"><button onClick={() => command('addFolder')}>Add Folder</button><button onClick={() => command('saveWorkspace')}>Save Workspace</button></div>}
    <div className="tree">{render(tree, 0)}</div>
    {!files.length && <div className="sidebar-message">No files yet.<button className="primary" onClick={() => command('new')}>Create a file</button></div>}
    <div className="explorer-footer">Local session recovery enabled.<br />Use Save to write changes to disk.</div>
  </>;
}
