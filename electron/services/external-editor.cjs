const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateRelative } = require('./workspaces.cjs');

function parseExternalArgs(argv, cwd = process.cwd()) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const match = /^--(workspace|open-file|line|column)(?:=(.*))?$/.exec(argv[index]);
    if (!match) continue;
    values[match[1]] = match[2] ?? argv[++index];
  }
  if (typeof values['open-file'] !== 'string' || !values['open-file'] || /[\x00-\x1f]/.test(values['open-file'])) return null;
  const coordinate = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), 10000000) : 1;
  return { file: path.resolve(cwd, values['open-file']), workspace: typeof values.workspace === 'string' && values.workspace ? path.resolve(cwd, values.workspace) : undefined, line: coordinate(values.line), column: coordinate(values.column) };
}
function contains(root, file) { const relative = path.relative(root, file); return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
class ExternalEditor {
  constructor(workspaces, emit, guards) { Object.assign(this, { workspaces, emit, guards }); this.requests = new Map(); }
  enqueue(argv, cwd) {
    const input = parseExternalArgs(argv, cwd);
    if (!input) return;
    if (this.requests.size >= 20) return;
    const id = crypto.randomUUID(); this.requests.set(id, input);
    this.emit({ type: 'external-open-request', id });
  }
  async resolve(id) {
    const request = this.requests.get(id);
    if (!request) throw new Error('External editor request expired.');
    const file = await fs.realpath(request.file);
    let workspace = request.workspace ? await fs.realpath(request.workspace) : undefined;
    let root = this.workspaces.roots.find(root => root.kind === 'local' && (workspace ? path.relative(root.path, workspace) === '' : contains(root.path, file)));
    if (!workspace) {
      workspace = root?.path;
      if (!workspace) {
        let current = path.dirname(file);
        for (let level = 0; level < 12; level++) {
          const names = await fs.readdir(current);
          if (names.some(name => /\.uproject$/i.test(name) || ['project.godot', 'game.project', '.git'].includes(name)) || names.includes('ProjectSettings') && names.includes('Assets')) { workspace = current; break; }
          const parent = path.dirname(current); if (parent === current) break; current = parent;
        }
      }
      workspace ??= path.dirname(file);
    }
    if (!contains(workspace, file)) throw new Error('Requested source file must be inside the external-editor workspace.');
    root ??= this.workspaces.roots.find(root => root.kind === 'local' && path.relative(root.path, workspace) === '');
    return { ...request, file, workspace, root, replacesWorkspace: !root };
  }
  async pending() {
    const values = [];
    for (const [id, request] of this.requests) {
      try { const value = await this.resolve(id); values.push({ id, file: value.file, workspace: value.workspace, line: value.line, column: value.column, replacesWorkspace: value.replacesWorkspace }); }
      catch (error) { values.push({ id, file: request.file, error: error.message }); }
    }
    return values;
  }
  reject(id) { this.requests.delete(id); }
  async accept(id, allowReplace) {
    const request = await this.resolve(id);
    const stat = await fs.stat(request.file);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('External source file must be a text file no larger than 2 MiB.');
    const content = await fs.readFile(request.file, 'utf8');
    if (content.includes('\0')) throw new Error('Binary assets cannot be opened as source text.');
    let root = request.root;
    if (!root) {
      if (!allowReplace) throw new Error('Confirm replacing the current workspace before opening this project.');
      this.guards.replace(); root = await this.workspaces.localRoot(request.workspace);
    } else if (root.id !== this.workspaces.activeId) this.guards.select();
    const replacesWorkspace = request.replacesWorkspace;
    const relative = validateRelative(path.relative(root.path, request.file).replaceAll('\\', '/'));
    let snapshot;
    if (replacesWorkspace) snapshot = await this.workspaces.installContexts([root]);
    else {
      const previousId = this.workspaces.activeId;
      try { this.workspaces.selected(root.id); snapshot = await this.workspaces.snapshot(); }
      catch (error) { this.workspaces.selected(previousId); throw error; }
    }
    if (replacesWorkspace) this.guards.replaced();
    const virtual = root.prefix + relative;
    // Enforce the same path/symlink policy as all other editor file operations.
    await this.workspaces.resolve(virtual);
    if (!snapshot.files.some(file => file.path === virtual)) snapshot.files.push({ path: virtual, content });
    this.requests.delete(id);
    return { snapshot, path: virtual, line: request.line, column: request.column, replacesWorkspace };
  }
}
module.exports = { ExternalEditor, parseExternalArgs };
