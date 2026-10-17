const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { parse } = require('jsonc-parser');
const { FramedPeer } = require('./rpc.cjs');

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', '.godot', '.vs', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'Library', 'Temp', 'Logs', 'obj']);
const binary = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|exe|dll|so|woff2?|ttf|mp[34]|wav|sqlite|db|ipynb|uasset|umap|pak|pck|fbx|blend|pdb|lib|a|o|obj|glb)$/i;
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
function validateRelative(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(p) || /[<>:"|?*]/.test(p) || /[. ]$/.test(p) || [...p].some(c => c.charCodeAt(0) < 32))) throw new Error('Invalid workspace-relative path.');
  return value;
}

class Workspaces {
  constructor(dialog, getWindow) {
    this.dialog = dialog;
    this.getWindow = getWindow;
    this.roots = [];
    this.activeId = '';
    this.generation = 0;
    this.mutations = Promise.resolve();
  }
  active() {
    if (this.installing) throw new Error('Workspace folders are changing. Wait for loading to finish.');
    const context = this.roots.find(root => root.id === this.activeId);
    if (!context) throw new Error('Open or reconnect a workspace folder first.');
    return context;
  }
  metadata() { return this.roots.map(({ id, name, key, prefix, kind, target, path: location }) => ({ id, name, key, prefix, kind, target, location })); }
  selected(id) {
    if (!this.roots.some(root => root.id === id)) throw new Error('Unknown workspace root.');
    this.activeId = id;
    return this.metadata();
  }
  locate(virtual) {
    if (typeof virtual !== 'string') throw new Error('Invalid path.');
    const explicit = this.roots.find(root => root.prefix && virtual.startsWith(root.prefix));
    if (!explicit && /^@[0-9a-f]{12}\//.test(virtual)) throw new Error('This workspace root is no longer connected. Reconnect it or export the buffer with Save As.');
    const context = explicit ?? this.roots.find(root => !root.prefix);
    if (!context) throw new Error('Reopen this workspace folder to grant access.');
    const relative = validateRelative(context.prefix ? virtual.slice(context.prefix.length) : virtual);
    return { context, relative };
  }
  async resolve(virtual) {
    const { context, relative } = this.locate(virtual);
    if (context.kind !== 'local') return { context, relative, full: path.posix.join(context.path, relative) };
    let current = context.path;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symlink access is not supported.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return { context, relative, full: current };
  }
  uri(virtual) {
    const { context, relative } = this.locate(virtual);
    return context.kind === 'local' ? pathToFileURL(path.join(context.path, relative)).toString() : 'file://' + path.posix.join(context.path, relative).split('/').map(encodeURIComponent).join('/');
  }
  virtual(uri, contextId) {
    const contexts = contextId ? this.roots.filter(root => root.id === contextId) : this.roots;
    for (const root of contexts) {
      let native;
      try { native = root.kind === 'local' ? fileURLToPath(uri) : decodeURIComponent(new URL(uri).pathname); } catch { continue; }
      const library = root.kind === 'local' ? path : path.posix;
      const relative = library.relative(root.path, native).replaceAll('\\', '/');
      if (relative && relative !== '..' && !relative.startsWith('../') && !library.isAbsolute(relative)) return root.prefix + relative;
    }
    return null;
  }
  async approve(title, detail) {
    const answer = await this.dialog.showMessageBox(this.getWindow(), { type: 'warning', title, message: title, detail, buttons: ['Cancel', 'Allow'], defaultId: 0, cancelId: 0 });
    if (answer.response !== 1) throw new Error('Cancelled.');
  }
  async localRoot(folder) {
    const location = await fs.realpath(folder);
    if (!(await fs.stat(location)).isDirectory()) throw new Error('Workspace root must be a directory.');
    const id = crypto.createHash('sha256').update(location).digest('hex').slice(0, 12);
    return { id, name: path.basename(location), key: location, path: location, kind: 'local', prefix: '' };
  }
  async choose(add = false) {
    if (add && !this.roots.length) throw new Error('Open or reconnect the first folder before adding another workspace root.');
    const selected = await this.dialog.showOpenDialog(this.getWindow(), { properties: ['openDirectory'] });
    if (selected.canceled) return null;
    const root = await this.localRoot(selected.filePaths[0]);
    return this.installContexts(add ? [...this.roots, root] : [root]);
  }
  async installContexts(roots) {
    if (this.installing) throw new Error('Workspace folders are already changing.');
    this.installing = true;
    try { await this.mutations; return await this.installNow(roots); }
    finally { this.installing = false; }
  }
  async installNow(roots) {
    if (roots.length > 20) throw new Error('A workspace can contain up to 20 roots.');
    if (new Set(roots.map(root => root.kind === 'local' && process.platform === 'win32' ? root.key.toLowerCase() : root.key)).size !== roots.length) throw new Error('This folder is already in the workspace.');
    // Preserve existing virtual prefixes when adding a root; never reinterpret an existing buffer's path.
    roots.forEach((root, index) => { if (index > 0 && !root.prefix) root.prefix = `@${root.id}/`; });
    const previous = this.roots;
    const previousId = this.activeId;
    this.roots = roots;
    this.activeId = roots.some(root => root.id === previousId) ? previousId : roots[0]?.id ?? '';
    try {
      const result = await this.snapshot();
      this.generation++;
      for (const old of previous) if (!roots.includes(old)) old.peer?.dispose();
      return result;
    } catch (error) { this.roots = previous; this.activeId = previousId; throw error; }
  }
  async snapshot() {
    const files = [];
    let skipped = 0;
    for (const root of this.roots) {
      const result = root.kind === 'local' ? await this.scanLocal(root) : await root.peer.request('scan', {}, 120000);
      files.push(...result.files.map(file => ({ ...file, path: root.prefix + file.path })));
      skipped += result.skipped;
    }
    if (new Set(files.map(file => file.path)).size !== files.length) throw new Error('A real directory conflicts with an internal workspace root prefix. Rename the conflicting directory before combining these roots.');
    return { name: this.roots.map(root => root.name).join(' + '), key: this.roots.map(root => root.key).join('|'), roots: this.metadata(), activeRootId: this.activeId, files, skipped };
  }
  async scanLocal(root) {
    const files = [];
    let skipped = 0, bytes = 0;
    const walk = async (directory, prefix = '') => {
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); }
      catch (error) { if (['ENOENT', 'EACCES', 'EPERM', 'EBUSY'].includes(error.code)) { skipped++; return; } throw error; }
      for (const entry of entries) {
        const relative = prefix + entry.name;
        if (entry.isSymbolicLink()) { skipped++; continue; }
        if (entry.isDirectory()) { if (!ignored.has(entry.name)) await walk(path.join(directory, entry.name), relative + '/'); }
        else if (entry.isFile()) {
          try {
          if (files.length >= 3000 || binary.test(relative)) { skipped++; continue; }
          const full = (await this.resolve(root.prefix + relative)).full;
          const size = (await fs.stat(full)).size;
          if (size > 2 * 1024 * 1024 || bytes + size > 20 * 1024 * 1024) { skipped++; continue; }
          const content = await fs.readFile(full, 'utf8');
          if (content.includes('\0')) { skipped++; continue; }
          files.push({ path: relative, content }); bytes += size;
          } catch (error) {
            if (['ENOENT', 'EACCES', 'EPERM', 'EBUSY'].includes(error.code) || error.message === 'Invalid workspace-relative path.') { skipped++; continue; }
            throw error;
          }
        }
      }
    };
    await walk(root.path);
    return { files, skipped };
  }
  async read(virtual) {
    const { context, relative, full } = await this.resolve(virtual);
    return context.kind === 'local' ? fs.readFile(full, 'utf8') : context.peer.request('read', { path: relative });
  }
  async write(virtual, content, expected) {
    return this.mutate(() => this.writeNow(virtual, content, expected));
  }
  mutate(operation) {
    if (this.installing) return Promise.reject(new Error('Workspace folders are changing. Retry the file operation after loading finishes.'));
    const generation = this.generation;
    const job = this.mutations.then(() => {
      if (this.generation !== generation) throw new Error('Workspace changed before the file operation could run.');
      return operation();
    });
    this.mutations = job.catch(() => {});
    return job;
  }
  async writeNow(virtual, content, expected) {
    if (typeof content !== 'string' || typeof expected !== 'string') throw new Error('Invalid content.');
    const { context, relative, full } = await this.resolve(virtual);
    if (context.kind !== 'local') return context.peer.request('write', { path: relative, content, expected });
    let original;
    try { original = await fs.readFile(full, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (original !== undefined && (expected === '\0' || original !== expected)) throw new Error('File changed on disk. Export a copy before refreshing.');
    if (original === undefined && expected !== '\0') throw new Error('File was removed on disk. Use Save As to recover it.');
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, { encoding: 'utf8', flag: original === undefined ? 'wx' : 'w' });
  }
  async rename(from, to) {
    return this.mutate(() => this.renameNow(from, to));
  }
  async renameNow(from, to) {
    const source = await this.resolve(from), destination = await this.resolve(to);
    if (source.context !== destination.context) throw new Error('Move across roots using Save As, then delete the original.');
    if (source.context.kind !== 'local') return source.context.peer.request('rename', { path: source.relative, to: destination.relative });
    try { await fs.access(destination.full); throw new Error('Destination already exists.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.mkdir(path.dirname(destination.full), { recursive: true });
    await fs.rename(source.full, destination.full);
  }
  async delete(virtual) {
    return this.mutate(async () => {
      const { context, relative, full } = await this.resolve(virtual);
      return context.kind === 'local' ? fs.unlink(full) : context.peer.request('delete', { path: relative });
    });
  }
  async config(name, fallback = {}) {
    const root = this.active();
    for (const directory of ['.23code', '.vscode']) {
      let content;
      try { content = await this.read(root.prefix + directory + '/' + name + '.json'); }
      catch (error) { if (error.code === 'ENOENT' || /No such file|not found/i.test(error.message)) continue; throw error; }
      const errors = [];
      const value = parse(content, errors, { allowTrailingComma: true });
      if (errors.length || !value || typeof value !== 'object') throw new Error(`Invalid ${directory}/${name}.json.`);
      return value;
    }
    return fallback;
  }
  spec(command, args = [], context = this.active(), terminal = false, cwd = context.path) {
    if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('Invalid executable configuration.');
    if (context.kind === 'local') return { file: command, args, cwd, env: { ...process.env } };
    const execCode = 'import os,sys;os.chdir(sys.argv[1]);os.execvp(sys.argv[2],sys.argv[2:])';
    const remoteArgs = ['python3', '-u', '-c', execCode, cwd, command, ...args];
    if (context.kind === 'wsl') return { file: 'wsl.exe', args: ['--distribution', context.target, '--exec', ...remoteArgs], env: { ...process.env } };
    if (context.kind === 'container') return { file: 'docker', args: ['exec', terminal ? '-it' : '-i', context.target, ...remoteArgs], env: { ...process.env } };
    return { file: 'ssh', args: [terminal ? '-tt' : '-T', '-oBatchMode=yes', '-oStrictHostKeyChecking=yes', context.target, remoteArgs.map(quote).join(' ')], env: { ...process.env } };
  }
  spawn(command, args, context = this.active(), options = {}) {
    const spec = this.spec(command, args, context, false, options.cwd ?? context.path);
    return spawn(spec.file, spec.args, { cwd: spec.cwd, env: { ...spec.env, ...options.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  async execute(command, args, context = this.active()) {
    const child = this.spawn(command, args, context);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    return new Promise((resolve, reject) => {
      let stdout = '', stderr = '', failure, bytes = 0;
      const fail = message => { if (!failure) { failure = new Error(message); clearTimeout(timer); child.kill(); reject(failure); } };
      const timer = setTimeout(() => fail('Command timed out.'), 30000);
      const append = (data, error) => {
        if (failure) return;
        bytes += Buffer.byteLength(data);
        if (bytes > 4 * 1024 * 1024) { fail('Command output exceeds the 4 MiB limit.'); return; }
        if (error) stderr += data; else stdout += data;
      };
      child.stdout.on('data', data => append(data, false));
      child.stderr.on('data', data => append(data, true));
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); if (failure) reject(failure); else if (code !== 0) reject(new Error(stderr || `Command exited ${code}.`)); else resolve(stdout); });
    });
  }
  async connect(spec, add = false) {
    if (add && !this.roots.length) throw new Error('Open or reconnect the first folder before adding another workspace root.');
    if (!spec || !['ssh', 'wsl', 'container'].includes(spec.kind) || typeof spec.target !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.@ :\-]*$/.test(spec.target) || typeof spec.path !== 'string' || !spec.path.startsWith('/') || /[\x00-\x1f]/.test(spec.path)) throw new Error('Use a valid SSH host alias, WSL distribution, or running container name and an absolute POSIX folder path.');
    if (spec.kind === 'ssh' && /\s/.test(spec.target)) throw new Error('SSH target cannot contain spaces. Configure a host alias in your SSH config.');
    await this.approve('Connect to remote workspace?', `${spec.kind}: ${spec.target}\nFolder: ${spec.path}\n\nRuns the bundled filesystem agent with Python 3 on the target. SSH requires an already trusted host key and key/agent authentication. No passwords or host keys are stored by this app.`);
    const key = `${spec.kind}:${spec.target}:${spec.path}`;
    const context = { ...spec, key, id: crypto.createHash('sha256').update(key).digest('hex').slice(0, 12), name: `${spec.target}:${path.posix.basename(spec.path)}`, prefix: '' };
    if (add && this.roots.length) context.prefix = `@${context.id}/`;
    const code = await fs.readFile(path.join(__dirname, 'remote-agent.py'), 'utf8');
    const launcher = 'import base64;exec(base64.b64decode(' + JSON.stringify(Buffer.from(code).toString('base64')) + '))';
    const child = this.spawn('python3', ['-u', '-c', launcher, spec.path], context);
    context.peer = new FramedPeer(child);
    context.peer.on('log', text => { context.lastError = text; });
    try { return await this.installContexts(add ? [...this.roots, context] : [context]); }
    catch (error) { context.peer.dispose(); throw new Error(`${error.message}\n${context.lastError ?? ''}`); }
  }
  async saveDescriptor() {
    if (!this.roots.length) throw new Error('Open at least one workspace folder first.');
    if (this.roots.some(root => root.kind !== 'local')) throw new Error('Saved descriptors currently support local roots. Reconnect remote targets explicitly from the Remote panel.');
    const result = await this.dialog.showSaveDialog(this.getWindow(), { defaultPath: 'project.23-workspace', filters: [{ name: '23 Code workspace', extensions: ['23-workspace'] }] });
    if (result.canceled) return;
    await fs.writeFile(result.filePath, JSON.stringify({ version: 1, folders: this.roots.map(root => ({ kind: root.kind, path: root.path, ...(root.target ? { target: root.target } : {}) })) }, null, 2));
  }
  async loadDescriptor() {
    const result = await this.dialog.showOpenDialog(this.getWindow(), { properties: ['openFile'], filters: [{ name: '23 Code workspace', extensions: ['23-workspace'] }] });
    if (result.canceled) return null;
    const value = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.folders) || !value.folders.length || value.folders.length > 20) throw new Error('Invalid workspace descriptor.');
    if (value.folders.some(folder => folder.kind !== 'local')) throw new Error('Reconnect remote folders explicitly from the Remote panel. Local multi-root descriptors are supported.');
    await this.approve('Open workspace folders?', value.folders.map(folder => folder.path).join('\n'));
    const roots = await Promise.all(value.folders.map(folder => this.localRoot(folder.path)));
    return this.installContexts(roots);
  }
  async remove(id) {
    if (!this.roots.some(root => root.id === id)) throw new Error('Workspace root not found.');
    return this.installContexts(this.roots.filter(root => root.id !== id));
  }
  dispose() { for (const root of this.roots) root.peer?.dispose(); }
}
module.exports = { Workspaces, validateRelative, quote };
