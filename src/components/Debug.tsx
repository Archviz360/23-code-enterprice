import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Square, StepForward, ArrowDownToLine, ArrowUpFromLine, RefreshCw, X } from 'lucide-react';
import type { DebugConfiguration, DebugFrame, DebugScope, DebugVariable } from '../lib/types';
import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
import { editConfiguration, examples } from '../lib/configurations';
import { startDebug } from '../lib/debugActions';

export function Debug({ reveal }: { reveal: (path: string, line: number, column: number) => void }) {
  const { debugState, debugOutput, breakpoints, watches, addWatch, removeWatch, setPausedLocation } = useIdeStore();
  const activeRootId = useEditorStore(state => state.activeRootId);
  const [configs, setConfigs] = useState<DebugConfiguration[]>([]);
  const [selected, setSelected] = useState('');
  const [frames, setFrames] = useState<DebugFrame[]>([]);
  const [frameId, setFrameId] = useState(0);
  const [variables, setVariables] = useState<{ scope: string; values: DebugVariable[] }[]>([]);
  const [expanded, setExpanded] = useState<Record<number, DebugVariable[]>>({});
  const [watch, setWatch] = useState('');
  const [watchValues, setWatchValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [consoleExpression, setConsoleExpression] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const refresh = useCallback(async () => {
    if (!window.desktop) return;
    try { const values = await window.desktop.debugConfigurations(); setConfigs(values); setSelected(previous => values.some(value => value.name === previous) ? previous : values[0]?.name ?? ''); setError(''); }
    catch (error) { setError((error as Error).message); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, activeRootId]);
  const selectFrame = useCallback(async (frame: DebugFrame) => {
    if (!window.desktop) return;
    setFrameId(frame.id); setExpanded({});
    if (frame.virtualPath) { reveal(frame.virtualPath, frame.line, frame.column); setPausedLocation({ path: frame.virtualPath, line: frame.line }); }
    const scopes = await window.desktop.debugRequest<{ scopes: DebugScope[] }>('scopes', { frameId: frame.id });
    const values = await Promise.all(scopes.scopes.filter(scope => !scope.expensive).map(async scope => ({ scope: scope.name, values: (await window.desktop!.debugRequest<{ variables: DebugVariable[] }>('variables', { variablesReference: scope.variablesReference })).variables })));
    setVariables(values);
    const evaluations = await Promise.all(watches.map(async expression => {
      try { return [expression, (await window.desktop!.debugRequest<{ result: string }>('evaluate', { expression, frameId: frame.id, context: 'watch' })).result] as const; }
      catch (error) { return [expression, (error as Error).message] as const; }
    }));
    setWatchValues(Object.fromEntries(evaluations));
  }, [reveal, setPausedLocation, watches]);
  useEffect(() => {
    if (debugState !== 'paused' || !window.desktop) { setFrames([]); setVariables([]); return; }
    let cancelled = false;
    void window.desktop.debugRequest<{ stackFrames: DebugFrame[] }>('stackTrace').then(async result => {
      if (cancelled) return;
      setFrames(result.stackFrames);
      if (result.stackFrames[0]) await selectFrame(result.stackFrames[0]);
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [debugState, selectFrame]);
  async function action(command: string) {
    try { if (command === 'start') await startDebug(selected); else if (command === 'stop') await window.desktop!.debugStop(); else await window.desktop!.debugRequest(command); setError(''); }
    catch (error) { setError((error as Error).message); }
  }
  function renderVariables(values: DebugVariable[], depth = 0): React.ReactNode {
    return values.slice(0, 200).map((variable, index) => <div key={`${variable.name}:${index}`} style={{ paddingLeft: depth ? 10 : 0 }}><button className="debug-variable" title={`${variable.name}: ${variable.value}`} onClick={async () => {
      if (!variable.variablesReference || !window.desktop) return;
      if (expanded[variable.variablesReference]) { setExpanded(previous => { const next = { ...previous }; delete next[variable.variablesReference]; return next; }); return; }
      try { const response = await window.desktop.debugRequest<{ variables: DebugVariable[] }>('variables', { variablesReference: variable.variablesReference }); setExpanded(previous => ({ ...previous, [variable.variablesReference]: response.variables })); } catch (error) { setError((error as Error).message); }
    }}>{variable.variablesReference ? expanded[variable.variablesReference] ? '▾ ' : '▸ ' : ''}<strong>{variable.name}</strong>: {variable.value}</button>{depth < 5 && expanded[variable.variablesReference] && renderVariables(expanded[variable.variablesReference], depth + 1)}</div>);
  }
  return <><div className="sidebar-heading">RUN & DEBUG<button className="icon-button" aria-label="Refresh debug configurations" onClick={() => void refresh()}><RefreshCw size={15} /></button></div><div className="tool-view debug-view">
    {!window.desktop ? <p>Debugging requires desktop mode.</p> : <><select aria-label="Debug configuration" value={selected} onChange={event => setSelected(event.target.value)}>{configs.map(config => <option key={config.name}>{config.name}</option>)}</select><div className="debug-toolbar"><button className="icon-button" title="Start (F5)" aria-label="Start debugging" disabled={debugState !== 'stopped'} onClick={() => void action('start')}><Play size={17} /></button><button className="icon-button" title="Continue (F5)" aria-label="Continue debugging" disabled={debugState !== 'paused'} onClick={() => void action('continue')}><Play size={17} /></button><button className="icon-button" aria-label="Pause debugging" disabled={debugState !== 'running'} onClick={() => void action('pause')}><Pause size={16} /></button><button className="icon-button" title="Step Over (F10)" aria-label="Step over" disabled={debugState !== 'paused'} onClick={() => void action('next')}><StepForward size={17} /></button><button className="icon-button" title="Step Into (F11)" aria-label="Step into" disabled={debugState !== 'paused'} onClick={() => void action('stepIn')}><ArrowDownToLine size={16} /></button><button className="icon-button" title="Step Out (Shift+F11)" aria-label="Step out" disabled={debugState !== 'paused'} onClick={() => void action('stepOut')}><ArrowUpFromLine size={16} /></button><button className="icon-button" title="Stop (Shift+F5)" aria-label="Stop debugging" disabled={debugState === 'stopped'} onClick={() => void action('stop')}><Square size={15} /></button></div><p className="muted">State: {debugState} · click the editor gutter to toggle breakpoints (F9).</p><button className="text-button" onClick={() => { try { editConfiguration('launch', examples.launch); } catch (error) { setError((error as Error).message); } }}>Configure launch.json</button><p className="muted">Bundled Node debugger for saved JavaScript; custom stdio DAP adapters for other languages. Install their runtime/adapter separately.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <h3>Call stack</h3>{frames.map(frame => <button key={frame.id} className={`debug-frame ${frameId === frame.id ? 'selected' : ''}`} onClick={() => void selectFrame(frame).catch(error => setError(error.message))}>{frame.name}<small>{frame.source?.name ?? frame.source?.path} : {frame.line}</small></button>)}
      <h3>Variables</h3>{variables.map(scope => <section key={scope.scope}><div className="section-label">{scope.scope}</div>{renderVariables(scope.values)}</section>)}
      <h3>Watch expressions</h3><form className="input-row" onSubmit={event => { event.preventDefault(); addWatch(watch); setWatch(''); }}><input aria-label="Watch expression" placeholder="Expression" value={watch} onChange={event => setWatch(event.target.value)} /><button type="submit">+</button></form>{watches.map(expression => <div className="watch-row" key={expression}><span>{expression}: <code>{watchValues[expression] ?? 'not paused'}</code></span><button className="icon-button" aria-label={`Remove watch ${expression}`} onClick={() => removeWatch(expression)}><X size={12} /></button></div>)}
      <h3>Breakpoints</h3>{Object.entries(breakpoints).flatMap(([path, lines]) => lines.map(line => <button className="debug-frame" key={`${path}:${line}`} onClick={() => reveal(path, line, 1)}>{path}:{line}<span className="text-button" onClick={event => { event.stopPropagation(); useIdeStore.getState().toggleBreakpoint(path, line); }}> ×</span></button>))}
      <h3>Debug console</h3><form className="input-row" onSubmit={async event => { event.preventDefault(); try { const response = await window.desktop!.debugRequest<{ result: string }>('evaluate', { expression: consoleExpression, frameId, context: 'repl' }); setEvaluation(response.result); } catch (error) { setEvaluation((error as Error).message); } }}><input aria-label="Debug expression" placeholder="Evaluate (can execute code)" value={consoleExpression} onChange={event => setConsoleExpression(event.target.value)} /><button disabled={debugState !== 'paused'}>↵</button></form><pre className="debug-output">{evaluation}{evaluation ? '\n' : ''}{debugOutput}</pre>
    </>}
  </div></>;
}
