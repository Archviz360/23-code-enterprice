import { X } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
import { InteractiveTerminal } from './InteractiveTerminal';

export function Panel({ markers, reveal }: { markers: editor.IMarker[]; reveal: (path: string, line: number, column: number) => void }) {
  const { panel, panelOpen, setPanel, togglePanel, output } = useEditorStore();
  const logs = useIdeStore(state => state.logs);
  return <section className="bottom-panel" hidden={!panelOpen} aria-label="Bottom panel">
    <div className="panel-header"><div className="panel-tabs">{(['problems', 'terminal', 'output'] as const).map(id => <button key={id} className={panel === id ? 'active' : ''} onClick={() => setPanel(id)}>{id.toUpperCase()}{id === 'problems' && <span className="badge">{markers.length}</span>}</button>)}</div><button className="icon-button" aria-label="Close panel" onClick={togglePanel}><X size={16} /></button></div>
    {panel === 'problems' && <div className="problem-list">{markers.length ? markers.map((marker, index) => <button key={index} onClick={() => reveal(marker.resource.path.replace(/^\/workspace\//, ''), marker.startLineNumber, marker.startColumn)}><span className={marker.severity === 8 ? 'error' : 'warning'}>{marker.severity === 8 ? '⊗' : '⚠'}</span><span>{marker.message}</span><small>{marker.resource.path.split('/').pop()} [{marker.startLineNumber}, {marker.startColumn}]</small></button>) : <p className="muted">No problems reported by Monaco or connected language servers.</p>}</div>}
    {panel === 'output' && <pre className="output">{output}{output && logs ? '\n\n' : ''}{logs}{!output && !logs ? 'Git diffs, task results, extensions, and language server logs appear here.' : ''}</pre>}
    <InteractiveTerminal visible={panelOpen && panel === 'terminal'} />
  </section>;
}
