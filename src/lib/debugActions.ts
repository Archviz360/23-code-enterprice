import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';
import { isDirty } from './files';

export async function startDebug(name?: string) {
  if (!window.desktop) throw new Error('Debugging requires desktop mode.');
  const store = useEditorStore.getState();
  const selected = store.focusedGroup === 'secondary' ? store.secondaryId : store.activeId;
  const file = store.files.find(file => file.id === selected);
  if (file && isDirty(file)) throw new Error('Save the active file to disk before debugging.');
  const configs = await window.desktop.debugConfigurations();
  const configuration = name ?? configs[0]?.name;
  if (!configuration) throw new Error('No debug configuration found.');
  await window.desktop.debugStart(configuration, file?.path, useIdeStore.getState().breakpoints);
  store.setSidebar('debug');
}
