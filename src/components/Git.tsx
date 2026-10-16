import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus, RefreshCw } from 'lucide-react';
import type { GitStatus } from '../lib/types';
import { useEditorStore } from '../store/editorStore';
export function Git({ reveal }: { reveal: (path: string) => void }) {
  const { workspaceName, activeRootId, setOutput } = useEditorStore();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!window.desktop) return;
    const request = ++refreshSequence.current;
    setBusy(true);
    try { const result = await window.desktop.gitStatus(); if (request === refreshSequence.current) { setStatus(result); setError(''); } }
    catch (error) { if (request === refreshSequence.current) { setStatus(null); setError((error as Error).message); } }
    finally { if (request === refreshSequence.current) setBusy(false); }
  }, []);
  // This is a request-generation counter, not a DOM ref; cleanup deliberately increments its latest value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setStatus(null); void refresh(); return () => { refreshSequence.current++; }; }, [refresh, workspaceName, activeRootId]);
  async function action(name: 'stage' | 'unstage' | 'commit' | 'diff', value: string) {
    if (!window.desktop) return;
    setBusy(true);
    try {
      const output = await window.desktop.gitAction(name, value);
      if (name === 'diff') setOutput(output);
      if (name === 'commit') { setMessage(''); setOutput(output); }
      await refresh();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <><div className="sidebar-heading">SOURCE CONTROL<button className="icon-button" aria-label="Refresh Git" onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} /></button></div>
    {!window.desktop ? <div className="sidebar-message"><h3>Git requires desktop mode</h3><p>Run <code>npm run desktop</code> to use your installed Git with a local repository. No changes are simulated in the browser.</p></div> : <div className="git-view">
      {error && <p className="error" role="alert">{error}</p>}
      {status && <><p className="muted">Branch: {status.branch}</p><textarea aria-label="Commit message" placeholder="Commit message" value={message} onChange={e => setMessage(e.target.value)} /><button className="primary" disabled={busy || !message.trim() || !status.changes.some(c => c.index !== ' ' && c.index !== '?')} onClick={() => void action('commit', message)}><Check size={15} />Commit staged changes</button>
        <p className="section-label">CHANGES ({status.changes.length})</p>
        {status.changes.map(change => <div className="git-change" key={change.path}><button onClick={() => reveal(change.path)} title={change.path}>{change.path}</button><code>{change.index}{change.working}</code><button className="icon-button" aria-label={`Diff ${change.path}`} onClick={() => void action('diff', change.path)} disabled={busy}>±</button>{change.index !== ' ' && change.index !== '?' && <button className="icon-button" aria-label={`Unstage ${change.path}`} onClick={() => void action('unstage', change.path)} disabled={busy}><Minus size={14} /></button>}{change.working !== ' ' && <button className="icon-button" aria-label={`Stage ${change.path}`} onClick={() => void action('stage', change.path)} disabled={busy}><Plus size={14} /></button>}</div>)}
        {!status.changes.length && <p className="muted">Working tree clean.</p>}<p className="muted">Git reads saved files on disk. Save and refresh before staging. Git must be installed separately.</p>
      </>}
    </div>}
  </>;
}
