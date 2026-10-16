import type { DirectoryHandle, FileEntry, WritableFileHandle } from './types';
import { binaryExtensions, ignoredDirectories, MAX_FILE_SIZE } from './files';

let directory: DirectoryHandle | null = null;
const handles = new Map<string, WritableFileHandle>();
export function hasWorkspaceAccess() { return Boolean(window.desktop || directory); }
export function resetWorkspaceAccess() { directory = null; handles.clear(); }

async function scan(root: DirectoryHandle) {
  const files: FileEntry[] = [];
  const nextHandles = new Map<string, WritableFileHandle>();
  let skipped = 0;
  let bytes = 0;
  async function walk(dir: DirectoryHandle, prefix = '') {
    for await (const entry of dir.values()) {
      const path = prefix + entry.name;
      if (entry.kind === 'directory') {
        if (!ignoredDirectories.has(entry.name)) await walk(entry, path + '/');
      } else {
        if (files.length >= 3000 || binaryExtensions.test(path)) { skipped++; continue; }
        const file = await entry.getFile();
        if (file.size > MAX_FILE_SIZE || bytes + file.size > 20 * 1024 * 1024) { skipped++; continue; }
        const content = await file.text();
        if (content.includes('\0')) { skipped++; continue; }
        nextHandles.set(path, entry);
        bytes += file.size;
        files.push({ path, content });
      }
    }
  }
  await walk(root);
  handles.clear();
  for (const [path, handle] of nextHandles) handles.set(path, handle);
  return { files, skipped };
}

export async function pickWorkspace() {
  if (window.desktop) return window.desktop.openFolder();
  if (!window.showDirectoryPicker) throw new Error('Folder access requires a Chromium browser or the desktop app. Use Open Files instead.');
  const selected = await window.showDirectoryPicker();
  const result = await scan(selected);
  directory = selected;
  return { name: selected.name, key: '', ...result };
}
export async function refreshWorkspace() {
  if (window.desktop) return window.desktop.refresh();
  if (!directory) throw new Error('Reopen the folder to grant filesystem access.');
  return scan(directory);
}
export async function writeWorkspaceFile(path: string, content: string, expected: string) {
  if (window.desktop) return window.desktop.writeFile(path, content, expected);
  if (!directory) throw new Error('Reopen the folder to grant filesystem access.');
  const parts = path.split('/');
  let parent = directory;
  for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part, { create: true });
  let existing: WritableFileHandle | undefined;
  try { existing = await parent.getFileHandle(parts[parts.length - 1]); }
  catch (error) { if ((error as Error).name !== 'NotFoundError') throw error; }
  if (existing && (expected === '\0' || await (await existing.getFile()).text() !== expected)) throw new Error('File changed on disk. Export a copy with Save As, then refresh and compare before overwriting.');
  if (!existing && expected !== '\0') throw new Error('File was removed on disk. Use Save As to recover it.');
  const handle = existing ?? await parent.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  handles.set(path, handle);
}
export async function removeWorkspaceFile(path: string) {
  if (window.desktop) return window.desktop.deleteFile(path);
  if (!directory) throw new Error('Reopen the folder to grant filesystem access.');
  const parts = path.split('/');
  let parent = directory;
  for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part);
  await parent.removeEntry(parts[parts.length - 1]);
  handles.delete(path);
}
export async function renameWorkspaceFile(from: string, to: string, content: string) {
  if (window.desktop) return window.desktop.renameFile(from, to);
  if (handles.has(to)) throw new Error('That file already exists.');
  const source = handles.get(from);
  if (!source || await (await source.getFile()).text() !== content) throw new Error('Source file changed on disk. Save a copy, then refresh before renaming.');
  await writeWorkspaceFile(to, content, '\0');
  await removeWorkspaceFile(from);
}
export async function saveDownload(path: string, content: string) {
  if (window.desktop) {
    if (!await window.desktop.saveAs(path.split('/').pop()!, content)) throw new DOMException('Save cancelled', 'AbortError');
    return;
  }
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: path.split('/').pop()! });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = path.split('/').pop()!;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
