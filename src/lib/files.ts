const languages: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less', json: 'json', md: 'markdown',
  yaml: 'yaml', yml: 'yaml', xml: 'xml', svg: 'xml', sh: 'shell', bash: 'shell',
  ps1: 'powershell', sql: 'sql', rs: 'rust', go: 'go', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  rb: 'ruby', toml: 'ini', ini: 'ini', txt: 'plaintext', vue: 'html', svelte: 'html',
};
export const languageIds = [...new Set(Object.values(languages))].sort();
export function languageFor(path: string): string {
  if (path.split('/').pop()?.toLowerCase() === 'dockerfile') return 'dockerfile';
  return languages[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext';
}
export function normalizePath(value: string): string {
  const path = value.trim().replaceAll('\\', '/');
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git' || /[<>:"|?*]/.test(p) || /[. ]$/.test(p) || [...p].some(c => c.charCodeAt(0) < 32))) {
    throw new Error('Use a relative file path without empty segments, .., or reserved characters.');
  }
  return path;
}
export function isDirty(file: { content: string; savedContent: string }): boolean {
  return file.content !== file.savedContent;
}
export const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__']);
export const binaryExtensions = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|exe|dll|so|woff2?|ttf|mp[34]|wav|sqlite|db|ipynb)$/i;
export const MAX_FILE_SIZE = 2 * 1024 * 1024;
