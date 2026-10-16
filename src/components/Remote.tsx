import { useState } from 'react';
import type { WorkspaceRoot } from '../lib/types';
import { useEditorStore } from '../store/editorStore';
import { isDirty } from '../lib/files';
import { Trash2 } from 'lucide-react';

export function Remote() {
  const { roots, activeRootId, selectRoot } = useEditorStore();
  const [kind, setKind] = useState<Exclude<WorkspaceRoot['kind'], 'local'>>('ssh');
  const [target, setTarget] = useState('');
  const [folder, setFolder] = useState('/home/user/project');
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function connect() {
    if (!window.desktop) return;
    if (!add && useEditorStore.getState().files.some(isDirty) && !confirm('Connecting replaces the current workspace and unsaved buffers. Save them first, or choose Add as another root. Continue?')) return;
    setBusy(true);
    try {
      const snapshot = await window.desktop.connectRemote({ kind, target, path: folder }, add);
      useEditorStore.getState().acceptWorkspace(snapshot, add); setError('');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <><div className="sidebar-heading">REMOTE & WORKSPACE ROOTS</div><div className="tool-view">
    {!window.desktop ? <p>Remote workspaces require desktop mode.</p> : <><h3>Connected roots</h3>{roots.map(root => <div className="tool-item" key={root.id}><div><strong>{root.name}</strong><small>{root.kind} · {root.location}</small></div><button disabled={root.id === activeRootId} onClick={() => void selectRoot(root.id).catch(error => setError(error.message))}>{root.id === activeRootId ? 'Active' : 'Select'}</button><button className="icon-button" aria-label={`Remove root ${root.name}`} onClick={async () => {
      if (!confirm('Remove this root from the workspace? Disk files are not deleted. Unsaved buffers remain available for export.')) return;
      try { useEditorStore.getState().acceptWorkspace(await window.desktop!.removeRoot(root.id), true); } catch (error) { setError((error as Error).message); }
    }}><Trash2 size={14} /></button></div>)}<p className="muted">The selected root supplies the working directory for terminals, Git, tasks, language servers, and debugging.</p>
      <h3>Connect</h3><label>Environment<select aria-label="Remote environment" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="ssh">SSH host / alias</option><option value="wsl">WSL distribution</option><option value="container">Running Docker container</option></select></label><label>{kind === 'ssh' ? 'Host alias or user@host' : kind === 'wsl' ? 'Distribution name' : 'Container name'}<input aria-label="Remote target" value={target} onChange={event => setTarget(event.target.value)} /></label><label>Absolute folder path<input aria-label="Remote folder" value={folder} onChange={event => setFolder(event.target.value)} /></label><label><input type="checkbox" checked={add} onChange={event => setAdd(event.target.checked)} />Add as another workspace root</label><button className="primary" disabled={busy || !target.trim() || !folder.startsWith('/')} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect to folder'}</button>
      <p className="muted">All targets need Python 3 and a POSIX shell. SSH uses installed OpenSSH, key/agent authentication, and an already trusted known_hosts entry. WSL and Docker must be installed; the distribution/container must already exist and be running. The app never auto-accepts SSH host keys.</p><p className="muted">Remote file editing, terminals, tasks, Git, and externally installed stdio LSP/DAP tools use the target environment. Docker image building and devcontainer.json orchestration are not included.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </>}
  </div></>;
}
