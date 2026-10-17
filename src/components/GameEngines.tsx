import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, FolderOpen } from 'lucide-react';
import type { EngineInventory, EngineProfile } from '../lib/types';
import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
import { editConfiguration } from '../lib/configurations';
import { engineLanguages, godotDebug, unityBuildHelper } from '../lib/engineConfigurations';

export function GameEngines() {
  const rootId = useEditorStore(state => state.activeRootId);
  const [inventory, setInventory] = useState<EngineInventory | null>(null);
  const [selected, setSelected] = useState('');
  const [profile, setProfile] = useState<EngineProfile>({});
  const [args, setArgs] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    if (!window.desktop) return;
    const root = useEditorStore.getState().activeRootId;
    const next = await window.desktop.enginesList();
    if (root !== useEditorStore.getState().activeRootId) return;
    setInventory(next); setSelected(current => next.projects.some(project => project.id === current) ? current : next.projects[0]?.id ?? '');
  }, []);
  async function perform(callback: () => Promise<unknown>) { setBusy(true); setError(''); try { await callback(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  useEffect(() => { setInventory(null); setSelected(''); setNotice(''); void refresh().catch(error => setError(error.message)); }, [rootId, refresh]);
  const project = inventory?.rootId === rootId ? inventory.projects.find(project => project.id === selected) : undefined;
  useEffect(() => { setProfile(project?.profile ?? {}); setArgs(JSON.stringify(project?.profile.args ?? [])); }, [project]);
  const dirty = JSON.stringify(profile) !== JSON.stringify(project?.profile ?? {}) || args !== JSON.stringify(project?.profile.args ?? []);
  async function choose(field: 'executable' | 'engineRoot' | 'buildTool') {
    const value = await window.desktop!.engineChoose(field === 'engineRoot');
    if (value) setProfile(current => ({ ...current, [field]: value }));
  }
  async function run(action: string) {
    if (!project) return;
    if (useEditorStore.getState().files.some(file => file.content !== file.savedContent)) throw new Error('Save project/configuration files before launching engine commands.');
    const terminal = await window.desktop!.engineRun(project.id, action, project.rootId);
    useIdeStore.getState().setTerminals(await window.desktop!.terminalList());
    useIdeStore.getState().setActiveTerminal(terminal.id); useEditorStore.getState().setPanel('terminal');
  }
  function scaffold() {
    if (!project) return;
    const store = useEditorStore.getState();
    const root = store.roots.find(root => root.id === rootId)!;
    const projectFolder = project.file.replace(/(?:ProjectSettings\/ProjectVersion\.txt|[^/]+)$/, '');
    const path = root.prefix + projectFolder + 'Assets/Editor/Code23Build.cs';
    const existing = store.files.find(file => file.path === path);
    if (existing) store.openTab(existing.id);
    else { const id = store.newFile(path); store.updateContent(id, unityBuildHelper); }
    store.setMessage('Review and save the generated Unity editor build helper. Existing files are never overwritten.');
  }
  return <><div className="sidebar-heading">GAME ENGINES<button className="icon-button" aria-label="Refresh game engines" disabled={busy} onClick={() => void perform(refresh)}><RefreshCw size={15} /></button></div><div className="tool-view engine-view">
    {!window.desktop ? <p>Engine processes require the desktop app. Language modes and source editing work in the browser.</p> : <>
      <p className="muted">Connect an installed editor to a local project. Unreal, Unity and Godot have command presets; other engines can use custom actions. No engine, SDK, license, or compiler is bundled.</p>
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
      {project && <><select aria-label="Game engine project" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy}>{inventory!.projects.map(project => <option key={project.id} value={project.id}>{project.kind} · {project.name}</option>)}</select><p>{project.file || 'Custom engine · selected workspace root'}</p>
        <label>Editor executable<div className="input-row"><input aria-label="Engine executable" value={profile.executable ?? ''} onChange={event => setProfile({ ...profile, executable: event.target.value })} /><button aria-label="Choose engine executable" disabled={busy} onClick={() => void perform(() => choose('executable'))}><FolderOpen size={15} /></button></div></label>
        {!!inventory!.installations.filter(installation => installation.kind === project.kind).length && <select aria-label="Detected engine installations" value="" onChange={event => setProfile({ ...profile, executable: event.target.value })}><option value="">Choose detected installation…</option>{inventory!.installations.filter(installation => installation.kind === project.kind).map(installation => <option key={installation.executable} value={installation.executable}>{installation.name}</option>)}</select>}
        <details><summary>Advanced arguments (JSON array)</summary><input aria-label="Engine prefix arguments" value={args} onChange={event => setArgs(event.target.value)} /></details>
        {project.kind === 'unreal' && <><label>Unreal installation root<div className="input-row"><input aria-label="Unreal engine root" value={profile.engineRoot ?? ''} onChange={event => setProfile({ ...profile, engineRoot: event.target.value })} /><button onClick={() => void perform(() => choose('engineRoot'))}><FolderOpen size={15} /></button></div></label><label>Build tool override<div className="input-row"><input aria-label="Unreal build tool" value={profile.buildTool ?? ''} onChange={event => setProfile({ ...profile, buildTool: event.target.value })} /><button onClick={() => void perform(() => choose('buildTool'))}><FolderOpen size={15} /></button></div></label><label>Target<input aria-label="Unreal build target" placeholder={project.name + 'Editor'} value={profile.target ?? ''} onChange={event => setProfile({ ...profile, target: event.target.value })} /></label><label>Configuration<select value={profile.configuration ?? 'Development'} onChange={event => setProfile({ ...profile, configuration: event.target.value })}>{['Development', 'DebugGame', 'Debug', 'Shipping', 'Test'].map(value => <option key={value}>{value}</option>)}</select></label><label>Platform<input placeholder="Win64" value={profile.platform ?? ''} onChange={event => setProfile({ ...profile, platform: event.target.value })} /></label><p className="muted">Build requires a native C++ target, the matching Unreal version and its Visual Studio/SDK toolchain. Project generation uses UnrealBuildTool; clangd needs its generated compilation database.</p></>}
        {project.kind === 'unity' && <><label>Static editor build method<input aria-label="Unity build method" placeholder="Code23Build.BuildWindows64" value={profile.buildMethod ?? ''} onChange={event => setProfile({ ...profile, buildMethod: event.target.value })} /></label><button onClick={scaffold}>Generate Unity build helper for review</button><p className="muted">Save the helper and enable scenes in Unity Build Settings. Unity must be licensed; tests require its Test Framework package. Use the Unity editor for Play mode and project-file generation.</p></>}
        {project.kind === 'godot' && <><label>Export preset<input aria-label="Godot export preset" value={profile.exportPreset ?? ''} onChange={event => setProfile({ ...profile, exportPreset: event.target.value })} /></label><label>Export output (relative to project)<input aria-label="Godot export output" placeholder="build/game.exe" value={profile.output ?? ''} onChange={event => setProfile({ ...profile, output: event.target.value })} /></label><p className="muted">Start the Godot editor and enable its loopback language/debug servers before connecting. Export needs a configured preset and matching export templates.</p></>}
        <button className="primary" disabled={busy} onClick={() => void perform(async () => {
          if (useEditorStore.getState().files.some(file => file.path.endsWith('.23code/engines.json') && file.content !== file.savedContent)) throw new Error('Save or discard your engine configuration buffer before saving this connection.');
          const next = await window.desktop!.engineSave(project.id, { ...profile, args: JSON.parse(args) }, project.rootId);
          if (next.rootId === useEditorStore.getState().activeRootId) { setInventory(next); setNotice('Connection saved in .23code/engines.json. Nothing was executed.'); }
        })}>Save engine connection</button>
        {dirty && <p className="muted">Save the connection before running commands.</p>}
        <div className="engine-actions">{(project.kind === 'unreal' ? [['open', 'Open Unreal editor'], ['build', 'Build C++ target'], ['run', 'Run game'], ['projectFiles', 'Generate project files'], ['compilationDatabase', 'Generate clangd database']] : project.kind === 'unity' ? [['open', 'Open Unity editor'], ['build', 'Build Windows player'], ['test', 'Run EditMode tests']] : project.kind === 'godot' ? [['open', 'Open Godot editor'], ['run', 'Run game'], ['export', 'Export release']] : [['open', 'Open custom editor'], ['build', 'Custom build'], ['run', 'Custom run']]).map(([action, label]) => <button key={action} disabled={busy || dirty} onClick={() => void perform(() => run(action))}>{label}</button>)}</div>
        <button onClick={() => editConfiguration('languages', engineLanguages(project))}>Configure engine language server</button>{project.kind === 'godot' && <button onClick={() => editConfiguration('launch', godotDebug(project))}>Configure Godot TCP debugger</button>}
        <button onClick={() => editConfiguration('engines', { profiles: { [project.id]: { executable: '', actions: { open: { command: 'installed-engine-command', args: ['${projectFolder}'] }, build: { command: 'installed-build-tool', args: ['${projectFolder}'] } } } } })}>Edit engine actions JSON</button>
        <details><summary>Use 23 Code as an external editor</summary><pre>{inventory!.externalEditor.executable || 'Build the Windows application first, then choose its .exe as the external editor.'}</pre><pre>{inventory!.externalEditor.flags}</pre><p className="muted">Godot: Editor Settings → Text Editor → External. Unity: Preferences → External Tools (use Unity’s file/line placeholders). Unreal’s editor-side source-code accessor may require a compatible accessor plugin; this app does not pretend to be a bundled Unreal plugin.</p></details>
      </>}
    </>}
  </div></>;
}
