const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const semver = require('semver');

async function extract(archive, destination) {
  const zip = await new Promise((resolve, reject) => yauzl.open(archive, { lazyEntries: true }, (error, value) => error ? reject(error) : resolve(value)));
  let bytes = 0, count = 0;
  await new Promise((resolve, reject) => {
    zip.on('error', reject); zip.on('end', resolve);
    zip.on('entry', async entry => {
      try {
        const name = entry.fileName.replace(/\/$/, '');
        if (!name || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part)) || name.startsWith('/') || ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) throw new Error('Unsafe archive path or symlink.');
        bytes += entry.uncompressedSize;
        if (++count > 2000 || bytes > 50 * 1024 * 1024) throw new Error('Extension exceeds archive limits (2,000 entries / 50 MiB).');
        const full = path.join(destination, ...name.split('/'));
        if (/\/$/.test(entry.fileName)) await fs.mkdir(full, { recursive: true });
        else {
          await fs.mkdir(path.dirname(full), { recursive: true });
          const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value)));
          await pipeline(stream, createWriteStream(full, { flags: 'wx' }));
        }
        zip.readEntry();
      } catch (error) { zip.close(); reject(error); }
    });
    zip.readEntry();
  });
}

class Extensions {
  constructor(app, workspaces, emit) {
    this.directory = path.join(app.getPath('userData'), 'extensions');
    this.workspaces = workspaces; this.emit = emit; this.hosts = new Map(); this.states = {}; this.pending = new Map();
  }
  async initialize() {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      const state = JSON.parse(await fs.readFile(path.join(this.directory, 'state.json'), 'utf8'));
      this.states = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    } catch { this.states = {}; }
    for (const extension of await this.list()) if (extension.enabled && extension.manifest.main) {
      try { await this.start(extension); } catch (error) { this.log(extension.id, error.message); }
    }
    this.emit({ type: 'extensions-changed' });
  }
  async list() {
    await fs.mkdir(this.directory, { recursive: true });
    const values = [];
    for (const entry of await fs.readdir(this.directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        const manifest = JSON.parse(await fs.readFile(path.join(this.directory, entry.name, 'package.json'), 'utf8'));
        // Missing/corrupted preferences must not reactivate a disabled host.
        values.push({ id: entry.name, manifest, enabled: this.states[entry.name] === true, running: this.hosts.has(entry.name) });
      } catch (error) { this.log(entry.name, error.message); }
    }
    return values;
  }
  log(id, text) { this.emit({ type: 'service-log', service: `extension:${id}`, text }); }
  async install(folder = false) {
    const result = await this.workspaces.dialog.showOpenDialog(this.workspaces.getWindow(), {
      properties: [folder ? 'openDirectory' : 'openFile'],
      ...(folder ? {} : { filters: [{ name: '23 Code extension archive', extensions: ['zip', 'vsix'] }] }),
    });
    if (result.canceled) return this.list();
    await fs.mkdir(this.directory, { recursive: true });
    const staging = await fs.mkdtemp(path.join(this.directory, '.install-'));
    try {
      let source = result.filePaths[0];
      if (!folder) { await extract(source, staging); source = staging; }
      let manifest;
      try { manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')); }
      catch {
        source = path.join(source, 'extension');
        manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
      }
      const id = manifest.id ?? (manifest.publisher && manifest.name ? `${manifest.publisher}.${manifest.name}` : manifest.name);
      if (!manifest.engines?.['23code']) throw new Error('This is not a compatible custom extension. A package must declare engines.23code. The full vscode API is not implemented.');
      if (typeof manifest.engines['23code'] !== 'string' || !semver.satisfies('0.2.0', manifest.engines['23code'])) throw new Error('This extension does not support the current 23 Code API version (0.2.0).');
      if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(id) || typeof manifest.version !== 'string') throw new Error('Extension needs a safe id and a version.');
      if (manifest.main && (typeof manifest.main !== 'string' || path.isAbsolute(manifest.main) || manifest.main.split(/[\\/]/).includes('..'))) throw new Error('Invalid extension entry point.');
      await this.workspaces.approve('Install trusted extension?', `${manifest.displayName ?? id} ${manifest.version}\n\nExtensions with a main entry run Node.js code with your full OS permissions. A separate process is not a security sandbox. Install only code you trust.`);
      const destination = path.join(this.directory, id);
      const previous = (await this.list()).find(extension => extension.id === id);
      if (previous) throw new Error('Uninstall the existing version first.');
      // No following symlinks from an unpacked extension folder.
      let checkedFiles = 0, checkedBytes = 0;
      const check = async directory => {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) throw new Error('Extension folders cannot contain symlinks.');
          if (entry.isDirectory()) await check(path.join(directory, entry.name));
          else { checkedFiles++; checkedBytes += (await fs.stat(path.join(directory, entry.name))).size; }
          if (checkedFiles > 2000 || checkedBytes > 50 * 1024 * 1024) throw new Error('Extension exceeds installation limits (2,000 files / 50 MiB).');
        }
      };
      await check(source);
      await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
      this.states[id] = true;
      await this.persist();
      if (manifest.main) {
        try { await this.start({ id, manifest }); }
        catch (error) { this.states[id] = false; await this.persist(); this.log(id, error.message); }
      }
      this.emit({ type: 'extensions-changed' });
      return this.list();
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  async start(extension) {
    if (this.hosts.has(extension.id) || !extension.manifest.main) return;
    const child = spawn(process.execPath, [path.join(__dirname, '../extension-host.cjs'), path.join(this.directory, extension.id)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const host = { child, commands: [] };
    this.hosts.set(extension.id, host);
    child.stdout.on('data', data => this.log(extension.id, data.toString()));
    child.stderr.on('data', data => this.log(extension.id, data.toString()));
    child.on('close', () => {
      if (this.hosts.get(extension.id) === host) this.hosts.delete(extension.id);
      for (const [id, pending] of this.pending) if (pending.host === host) { clearTimeout(pending.timer); this.pending.delete(id); pending.reject(new Error('Extension host exited.')); }
      this.emit({ type: 'extensions-changed' });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Extension activation timed out.')); }, 10000);
      child.once('close', () => { clearTimeout(timer); reject(new Error('Extension host exited during activation.')); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('message', message => {
        if (message.type === 'ready') { clearTimeout(timer); host.commands = message.commands; resolve(); }
        if (message.type === 'failed') { clearTimeout(timer); child.kill(); reject(new Error(message.error)); }
        if (message.type === 'message') this.emit({ type: 'extension-message', text: String(message.text) });
        if (message.type === 'result') {
          const pending = this.pending.get(message.id);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result); }
        }
      });
    });
  }
  async persist() { await fs.writeFile(path.join(this.directory, 'state.json'), JSON.stringify(this.states)); }
  async toggle(id, enabled) {
    const extension = (await this.list()).find(value => value.id === id);
    if (!extension) throw new Error('Extension not found.');
    if (enabled) {
      await this.workspaces.approve('Enable trusted extension?', `${id}\nEnabling an executable extension runs its Node.js activation code.`);
      await this.start(extension);
    } else { this.hosts.get(id)?.child.kill(); this.hosts.delete(id); }
    this.states[id] = Boolean(enabled); await this.persist();
    this.emit({ type: 'extensions-changed' }); return this.list();
  }
  async uninstall(id) {
    const extension = (await this.list()).find(value => value.id === id);
    if (!extension) throw new Error('Extension not found.');
    await this.workspaces.approve('Uninstall extension?', id);
    this.hosts.get(id)?.child.kill(); this.hosts.delete(id);
    await fs.rm(path.join(this.directory, extension.id), { recursive: true, force: true });
    delete this.states[id]; await this.persist(); this.emit({ type: 'extensions-changed' }); return this.list();
  }
  async commands() {
    return (await this.list()).filter(extension => extension.enabled).flatMap(extension => (extension.manifest.contributes?.commands ?? []).filter(command => this.hosts.get(extension.id)?.commands.includes(command.id)).map(command => ({ ...command, extensionId: extension.id })));
  }
  run(id, command, context) {
    const host = this.hosts.get(id);
    if (!host || !host.commands.includes(command)) throw new Error('Extension command is unavailable.');
    const request = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(request); reject(new Error('Extension command timed out.')); }, 30000);
      this.pending.set(request, { resolve, reject, timer, host });
      host.child.send({ type: 'command', id: request, command, context }, error => {
        if (error && this.pending.has(request)) { clearTimeout(timer); this.pending.delete(request); reject(error); }
      });
    });
  }
  dispose() { for (const host of this.hosts.values()) host.child.kill(); }
}
module.exports = { Extensions, extract };
