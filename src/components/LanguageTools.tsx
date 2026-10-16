import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, Square } from 'lucide-react';
import type { LanguageConfiguration } from '../lib/types';
import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
import { editConfiguration, examples } from '../lib/configurations';

export function LanguageTools() {
  const activeRootId = useEditorStore(state => state.activeRootId);
  const sessions = useIdeStore(state => state.languages);
  const [servers, setServers] = useState<LanguageConfiguration[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!window.desktop) return;
    try { setServers(await window.desktop.languagesList()); setError(''); } catch (error) { setError((error as Error).message); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, activeRootId]);
  async function toggle(server: LanguageConfiguration) {
    setBusy(server.id);
    try {
      const existing = sessions.find(session => session.id === `${activeRootId}:${server.id}`);
      if (existing) await window.desktop!.languageStop(existing.id);
      else { await window.desktop!.languageStart(server.id); useIdeStore.getState().setLanguages(await window.desktop!.languagesRunning()); }
      await refresh();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(''); }
  }
  return <><div className="sidebar-heading">LANGUAGE SERVERS<button className="icon-button" aria-label="Refresh language servers" onClick={() => void refresh()}><RefreshCw size={15} /></button></div><div className="tool-view">
    {!window.desktop ? <p>External language servers require desktop mode. Built-in Monaco tools remain available.</p> : <><button className="primary" onClick={() => { try { editConfiguration('languages', examples.languages); } catch (error) { setError((error as Error).message); } }}>Configure language servers</button><p className="muted">Python includes bundled Pyright. Configure other stdio LSP servers installed locally or on the selected remote target. Servers start only with your approval.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {servers.map(server => { const running = sessions.some(session => session.id === `${activeRootId}:${server.id}`); return <div className="tool-item" key={server.id}><div><strong>{server.name ?? server.id}</strong><small>{server.languages.join(', ')} · {running ? 'running' : 'stopped'}</small></div><button className="icon-button" aria-label={`${running ? 'Stop' : 'Start'} ${server.id}`} disabled={Boolean(busy)} onClick={() => void toggle(server)}>{running ? <Square size={14} /> : <Play size={15} />}</button></div>; })}
      <p className="muted">Completion, hover, definitions, references, rename, formatting, text-edit code actions, and diagnostics depend on server capabilities. Refactorings apply to loaded buffers; Save All writes them to disk.</p>
    </>}
  </div></>;
}
