import { useEditorStore } from '../store/editorStore';
export function editConfiguration(name: string, value: unknown) {
  const store = useEditorStore.getState();
  const root = store.roots.find(root => root.id === store.activeRootId);
  if (!root) throw new Error('Open a folder first.');
  const path = root.prefix + '.23code/' + name + '.json';
  const existing = store.files.find(file => file.path === path);
  if (existing) store.openTab(existing.id);
  else { const id = store.newFile(path); store.updateContent(id, JSON.stringify(value, null, 2) + '\n'); }
  store.setMessage('Save the configuration to disk, then refresh the tool panel. Configuration files never execute automatically.');
}
export const examples = {
  tasks: { version: '2.0.0', tasks: [{ label: 'Build project', type: 'shell', command: 'npm run build', options: { cwd: '${workspaceFolder}' } }, { label: 'Test project', type: 'shell', command: 'npm test' }] },
  languages: { servers: [{ id: 'clangd', name: 'C/C++ · clangd (install separately)', languages: ['c', 'cpp'], command: 'clangd', args: [] }, { id: 'rust-analyzer', name: 'Rust · rust-analyzer (install separately)', languages: ['rust'], command: 'rust-analyzer', args: [] }] },
  launch: { version: '0.2.0', configurations: [{ name: 'Debug JavaScript', type: 'node', request: 'launch', program: '${file}', stopOnEntry: true }, { name: 'Python (install debugpy)', type: 'dap', request: 'launch', adapter: { command: 'python', args: ['-m', 'debugpy.adapter'] }, program: '${file}', console: 'internalConsole', justMyCode: true }] },
};
