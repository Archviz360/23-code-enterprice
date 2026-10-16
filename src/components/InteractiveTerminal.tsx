import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Plus, Trash2 } from 'lucide-react';
import { useIdeStore } from '../store/ideStore';
import { useEditorStore } from '../store/editorStore';

export function InteractiveTerminal({ visible }: { visible: boolean }) {
  const { terminals, activeTerminal, setActiveTerminal } = useIdeStore();
  const active = terminals.find(session => session.id === activeTerminal);
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const [starting, setStarting] = useState(false);
  async function create() {
    if (!window.desktop) return;
    setStarting(true);
    try {
      const session = await window.desktop.terminalCreate();
      useIdeStore.getState().setTerminals(await window.desktop.terminalList());
      setActiveTerminal(session.id);
    } catch (error) { useEditorStore.getState().setMessage((error as Error).message); }
    finally { setStarting(false); }
  }
  useEffect(() => {
    if (!host.current || !activeTerminal) return;
    const terminal = new Terminal({ cursorBlink: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, scrollback: 5000, theme: { background: '#1f1f1f', foreground: '#cccccc' }, allowProposedApi: false });
    const addon = new FitAddon(); terminal.loadAddon(addon);
    terminal.open(host.current); term.current = terminal; fit.current = addon;
    terminal.write(useIdeStore.getState().terminals.find(session => session.id === activeTerminal)?.backlog ?? '');
    const input = terminal.onData(data => { void window.desktop?.terminalWrite(activeTerminal, data).catch(error => terminal.write(`\r\n${error.message}\r\n`)); });
    const events = window.desktop?.onEvent(event => {
      if (event.type === 'terminal-data' && event.id === activeTerminal) terminal.write(event.data);
      if (event.type === 'terminal-exit' && event.id === activeTerminal) terminal.write(`\r\n[Process exited ${event.code}]\r\n`);
    });
    const resize = () => {
      if (!host.current?.clientWidth || !host.current.clientHeight) return;
      addon.fit(); void window.desktop?.terminalResize(activeTerminal, terminal.cols, terminal.rows).catch(() => {});
    };
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    resize(); terminal.focus();
    return () => { observer.disconnect(); input.dispose(); events?.(); terminal.dispose(); term.current = null; fit.current = null; };
  }, [activeTerminal]);
  useEffect(() => { if (visible) requestAnimationFrame(() => { fit.current?.fit(); if (term.current && activeTerminal) void window.desktop?.terminalResize(activeTerminal, term.current.cols, term.current.rows); }); }, [visible, activeTerminal]);
  return <div className="interactive-terminal" hidden={!visible}>
    <div className="terminal-toolbar"><select aria-label="Terminal session" value={activeTerminal ?? ''} onChange={event => setActiveTerminal(event.target.value)}><option value="" disabled>Select a terminal</option>{terminals.map(session => <option key={session.id} value={session.id}>{session.name}{session.exited ? ` (exit ${session.exitCode})` : ''}</option>)}</select><button className="icon-button" aria-label="New terminal" onClick={() => void create()} disabled={!window.desktop || starting}><Plus size={15} /></button><button className="icon-button" aria-label="Kill terminal" disabled={!active} onClick={() => { if (active && window.desktop) void window.desktop.terminalClose(active.id).catch(error => useEditorStore.getState().setMessage(error.message)); }}><Trash2 size={14} /></button><span className="muted">Persistent PTY · Ctrl+C interrupts · commands run with your user permissions</span></div>
    {!window.desktop && <p className="sidebar-message">Shell commands require the desktop app. A browser cannot execute local processes.</p>}
    {window.desktop && !active && <div className="terminal-empty"><p>Open an interactive shell in the selected workspace root.</p><button className="primary" disabled={starting} onClick={() => void create()}>New Terminal</button></div>}
    <div className="xterm-host" ref={host} hidden={!active} />
  </div>;
}
