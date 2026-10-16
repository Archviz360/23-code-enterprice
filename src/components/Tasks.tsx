import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, Square } from 'lucide-react';
import type { TaskConfiguration } from '../lib/types';
import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
import { editConfiguration, examples } from '../lib/configurations';

export function Tasks() {
  const activeRootId = useEditorStore(state => state.activeRootId);
  const runs = useIdeStore(state => state.tasks);
  const [tasks, setTasks] = useState<TaskConfiguration[]>([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!window.desktop) return;
    try { setTasks(await window.desktop.tasksList()); setError(''); } catch (error) { setError((error as Error).message); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, activeRootId]);
  async function run(label: string) {
    try {
      const store = useEditorStore.getState();
      const id = store.focusedGroup === 'secondary' ? store.secondaryId : store.activeId;
      await window.desktop!.tasksRun(label, store.files.find(file => file.id === id)?.path);
      store.setPanel('terminal'); setError('');
    } catch (error) { setError((error as Error).message); }
  }
  return <><div className="sidebar-heading">BUILD & TASKS<button className="icon-button" aria-label="Refresh tasks" onClick={() => void refresh()}><RefreshCw size={15} /></button></div><div className="tool-view">
    {!window.desktop ? <p>Tasks require the desktop app.</p> : <><button className="primary" onClick={() => { try { editConfiguration('tasks', examples.tasks); } catch (error) { setError((error as Error).message); } }}>Configure tasks.json</button><p className="muted">Saved .23code/tasks.json and .vscode/tasks.json are supported. npm scripts are discovered automatically. Save your code before running.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {tasks.map(task => <div className="tool-item" key={task.label}><div><strong>{task.label}</strong><small>{task.source} · {task.command ?? 'dependency group'}</small></div><button className="icon-button" aria-label={`Run task ${task.label}`} onClick={() => void run(task.label)}><Play size={15} /></button></div>)}
      {!tasks.length && <p className="muted">No tasks found. Configure a task or add package.json scripts.</p>}
      <h3>Recent runs</h3>{runs.map(run => <div className="tool-item" key={run.id}><button onClick={() => { useIdeStore.getState().setActiveTerminal(run.terminalId); useEditorStore.getState().setPanel('terminal'); }}>{run.label}<small>{run.status}{run.code === undefined ? '' : ` · exit ${run.code}`}</small></button>{run.status === 'running' && <button className="icon-button" aria-label={`Stop task ${run.label}`} onClick={() => void window.desktop!.tasksStop(run.id).catch(error => setError(error.message))}><Square size={14} /></button>}</div>)}
    </>}
  </div></>;
}
