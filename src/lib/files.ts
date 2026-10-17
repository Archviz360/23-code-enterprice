import { detectLanguage } from './languageCatalog';
import { useLanguageStore } from '../store/languageStore';
export { languageIds } from './languageCatalog';
export function languageFor(path: string, content = ''): string {
  const { custom, associations } = useLanguageStore.getState();
  return detectLanguage(path, content, custom, associations);
}
export function normalizePath(value: string): string {
  const path = value.trim().replaceAll('\\', '/');
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(p) || /[<>:"|?*]/.test(p) || /[. ]$/.test(p) || [...p].some(c => c.charCodeAt(0) < 32))) {
    throw new Error('Use a relative file path without empty segments, .., or reserved characters.');
  }
  return path;
}
export function isDirty(file: { content: string; savedContent: string }): boolean {
  return file.content !== file.savedContent;
}
export const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', '.godot', '.vs', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'Library', 'Temp', 'Logs', 'obj']);
export const binaryExtensions = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|exe|dll|so|woff2?|ttf|mp[34]|wav|sqlite|db|ipynb|uasset|umap|pak|pck|fbx|blend|pdb|lib|a|o|obj|glb)$/i;
export const MAX_FILE_SIZE = 2 * 1024 * 1024;
