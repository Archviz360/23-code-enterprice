import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExtensionCommand, ExtensionInfo, IdeEvent, LanguageSession, TaskRun, TerminalSession } from '../lib/types';
import { useEditorStore } from './editorStore';

interface IdeState {
  terminals: TerminalSession[]; activeTerminal: string | null; languages: LanguageSession[];
  extensions: ExtensionInfo[]; extensionCommands: ExtensionCommand[]; extensionsReady: boolean;
  tasks: TaskRun[]; logs: string; debugOutput: string; debugState: 'stopped' | 'starting' | 'running' | 'paused'; debugThread: number;
  breakpoints: Record<string, number[]>; watches: string[]; pausedLocation: { path: string; line: number } | null;
  setTerminals: (value: TerminalSession[]) => void;
  setActiveTerminal: (id: string | null) => void;
  setLanguages: (value: LanguageSession[]) => void;
  refreshExtensions: () => Promise<void>;
  handle: (event: IdeEvent) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  addWatch: (expression: string) => void;
  removeWatch: (expression: string) => void;
  setPausedLocation: (location: IdeState['pausedLocation']) => void;
}
export const useIdeStore = create<IdeState>()(persist((set, get) => ({
  terminals: [], activeTerminal: null, languages: [], extensions: [], extensionCommands: [], extensionsReady: false, tasks: [], logs: '', debugOutput: '', debugState: 'stopped', debugThread: 1,
  breakpoints: {}, watches: [], pausedLocation: null,
  setTerminals: terminals => set(state => ({ terminals, activeTerminal: terminals.some(terminal => terminal.id === state.activeTerminal) ? state.activeTerminal : terminals.at(-1)?.id ?? null })),
  setActiveTerminal: activeTerminal => set({ activeTerminal }),
  setLanguages: languages => set({ languages }),
  refreshExtensions: async () => { if (window.desktop) set({ extensions: await window.desktop.extensionsList(), extensionCommands: await window.desktop.extensionCommands(), extensionsReady: true }); },
  handle: event => {
    switch (event.type) {
      case 'terminals': get().setTerminals(event.sessions); break;
      case 'terminal-data': set(state => ({ terminals: state.terminals.map(session => session.id === event.id ? { ...session, backlog: (session.backlog + event.data).slice(-512 * 1024) } : session) })); break;
      case 'terminal-exit': set(state => ({ terminals: state.terminals.map(session => session.id === event.id ? { ...session, exited: true, exitCode: event.code } : session) })); break;
      case 'task': set(state => ({ tasks: [...state.tasks.filter(task => task.id !== event.id), event].slice(-50), ...(event.status === 'running' ? { activeTerminal: event.terminalId } : {}) })); useEditorStore.getState().setPanel('terminal'); break;
      case 'service-log': set(state => ({ logs: (state.logs + `[${event.service}] ${event.text}\n`).slice(-512 * 1024) })); break;
      case 'debug-output': set(state => ({ debugOutput: (state.debugOutput + event.text).slice(-512 * 1024) })); break;
      case 'debug-state': set({ debugState: event.state, debugThread: event.threadId ?? get().debugThread, ...(event.state !== 'paused' ? { pausedLocation: null } : {}) }); break;
      case 'extension-message': useEditorStore.getState().setMessage(event.text); break;
      case 'extensions-changed': void get().refreshExtensions().catch(error => useEditorStore.getState().setMessage(error.message)); break;
      case 'language-started': set(state => ({ languages: [...state.languages.filter(session => session.id !== event.session.id), event.session] })); break;
      case 'language-stopped': set(state => ({ languages: state.languages.filter(session => session.id !== event.id) })); break;
    }
  },
  toggleBreakpoint: (path, line) => {
    const lines = get().breakpoints[path] ?? [];
    const next = lines.includes(line) ? lines.filter(value => value !== line) : [...lines, line].sort((a, b) => a - b);
    set(state => ({ breakpoints: { ...state.breakpoints, [path]: next } }));
    void window.desktop?.debugBreakpoints(path, next).catch(error => useEditorStore.getState().setMessage(error.message));
  },
  addWatch: expression => { if (expression.trim()) set(state => ({ watches: [...new Set([...state.watches, expression.trim()])] })); },
  removeWatch: expression => set(state => ({ watches: state.watches.filter(value => value !== expression) })),
  setPausedLocation: pausedLocation => set({ pausedLocation }),
}), { name: '23-code-debug-v1', partialize: state => ({ breakpoints: state.breakpoints, watches: state.watches }) }));
