import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
export function Settings() {
  const { settings, setSettings } = useEditorStore();
  const themes = useIdeStore(state => state.extensions).filter(extension => extension.enabled).flatMap(extension => (extension.manifest.contributes?.themes ?? []).map(theme => ({ id: `extension:${extension.id}:${theme.name}`, name: theme.name })));
  return <><div className="sidebar-heading">SETTINGS</div><div className="settings-form">
    <h3>Editor preferences</h3><p className="muted">Saved on this device.</p>
    <label>Color theme<select value={settings.theme} onChange={e => setSettings({ theme: e.target.value })}><option value="vs-dark">Dark Modern</option><option value="light">Light Modern</option>{themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
    <label>Font size<input aria-label="Font size" type="number" min="10" max="40" value={settings.fontSize} onChange={e => setSettings({ fontSize: Number(e.target.value) })} /></label>
    <label>Tab size<input type="number" min="1" max="8" value={settings.tabSize} onChange={e => setSettings({ tabSize: Number(e.target.value) })} /></label>
    <label><input type="checkbox" checked={settings.wordWrap === 'on'} onChange={e => setSettings({ wordWrap: e.target.checked ? 'on' : 'off' })} />Word wrap</label>
    <label><input type="checkbox" checked={settings.minimap} onChange={e => setSettings({ minimap: e.target.checked })} />Minimap</label>
    <label><input type="checkbox" checked={settings.lineNumbers} onChange={e => setSettings({ lineNumbers: e.target.checked })} />Line numbers</label>
    <label><input type="checkbox" checked={settings.autoSave} onChange={e => setSettings({ autoSave: e.target.checked })} />Auto save (linked folders only)</label>
    <p className="muted">Auto save waits one second after typing. Reopen restored folders to grant disk access.</p>
    <h3>Keyboard shortcuts</h3><dl className="shortcuts"><dt>Commands</dt><dd>Ctrl+Shift+P</dd><dt>Quick Open</dt><dd>Ctrl+P</dd><dt>Save</dt><dd>Ctrl+S</dd><dt>Find / Replace</dt><dd>Ctrl+F / H</dd><dt>Workspace search</dt><dd>Ctrl+Shift+F</dd><dt>Go to line</dt><dd>Ctrl+G</dd><dt>Format</dt><dd>Shift+Alt+F</dd><dt>Toggle panel</dt><dd>Ctrl+J</dd><dt>Toggle sidebar</dt><dd>Ctrl+B</dd></dl>
  </div></>;
}
