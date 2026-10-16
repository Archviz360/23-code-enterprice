import { useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useIdeStore } from '../store/ideStore';
import { Collaboration } from './Collaboration';

export function Extensions() {
  const { extensions, refreshExtensions } = useIdeStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function operation(callback: () => Promise<unknown>) {
    setBusy(true);
    try { await callback(); await refreshExtensions(); setError(''); } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <><div className="sidebar-heading">CUSTOM EXTENSIONS<button className="icon-button" aria-label="Refresh extensions" onClick={() => void operation(refreshExtensions)}><RefreshCw size={15} /></button></div><div className="tool-view">
    {!window.desktop ? <p>Installing extensions requires desktop mode.</p> : <><button className="primary" disabled={busy} onClick={() => void operation(() => window.desktop!.extensionsInstall(false))}>Install extension ZIP / compatible VSIX…</button><button className="text-button" disabled={busy} onClick={() => void operation(() => window.desktop!.extensionsInstall(true))}>Install from folder…</button>
      <p className="muted">Custom packages must declare engines.23code. This is not the full vscode API or the Microsoft Marketplace. Extensions may contribute commands, snippets, themes, and language server configurations.</p><p className="warning">Executable extensions run with your user permissions. Install only trusted code.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {extensions.map(extension => <div className="extension-card" key={extension.id}><strong>{extension.manifest.displayName ?? extension.id}</strong><small>{extension.id} · {extension.manifest.version}</small><div><button disabled={busy} onClick={() => void operation(() => window.desktop!.extensionsToggle(extension.id, !extension.enabled))}>{extension.enabled ? 'Disable' : 'Enable'}</button><button disabled={busy} className="icon-button" aria-label={`Uninstall ${extension.id}`} onClick={() => void operation(() => window.desktop!.extensionsUninstall(extension.id))}><Trash2 size={14} /></button></div></div>)}
      {!extensions.length && <p className="muted">No custom extensions installed. Try the source repository's examples/hello-extension folder.</p>}
    </>}
    <Collaboration />
  </div></>;
}
