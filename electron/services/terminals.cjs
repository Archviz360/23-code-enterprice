const pty = require('@lydell/node-pty');
const crypto = require('node:crypto');

class Terminals {
  constructor(workspaces, emit) { this.workspaces = workspaces; this.emit = emit; this.sessions = new Map(); }
  list() { return [...this.sessions.values()].map(({ id, name, rootId, exited, exitCode, backlog }) => ({ id, name, rootId, exited, exitCode, backlog })); }
  async create(options = {}, approved = false, context = this.workspaces.active()) {
    if (this.sessions.size >= 12) throw new Error('Close an existing terminal before opening another (limit: 12).');
    if (!approved) await this.workspaces.approve('Start interactive terminal?', `Folder: ${context.path}\nContext: ${context.kind}\n\nThis shell has your user permissions and can execute arbitrary commands. Only use trusted projects.`);
    if (this.sessions.size >= 12) throw new Error('Close an existing terminal before opening another (limit: 12).');
    const windows = context.kind === 'local' && process.platform === 'win32';
    const command = options.command ?? (windows ? 'powershell.exe' : '/bin/sh');
    const args = options.args ?? (windows ? ['-NoLogo', '-NoProfile'] : ['-l']);
    const spec = this.workspaces.spec(command, args, context, true, options.cwd ?? context.path);
    const id = crypto.randomUUID();
    const terminalProcess = pty.spawn(spec.file, spec.args, {
      name: 'xterm-256color', cols: Math.max(20, Math.min(300, options.cols || 80)), rows: Math.max(5, Math.min(200, options.rows || 24)),
      cwd: spec.cwd, env: { ...spec.env, ...options.env, TERM: 'xterm-256color' },
    });
    const session = { id, name: options.name ?? `${context.name} · shell`, rootId: context.id, process: terminalProcess, backlog: '', exited: false, exitCode: null };
    this.sessions.set(id, session);
    terminalProcess.onData(data => {
      session.backlog = (session.backlog + data).slice(-512 * 1024);
      this.emit({ type: 'terminal-data', id, data });
    });
    session.done = new Promise(resolve => {
      terminalProcess.onExit(({ exitCode }) => {
        session.exited = true; session.exitCode = exitCode;
        this.emit({ type: 'terminal-exit', id, code: exitCode });
        resolve(exitCode);
      });
      terminalProcess.on('error', error => {
        session.exited = true; session.exitCode = -1;
        this.emit({ type: 'service-log', service: 'terminal', text: error.message });
        this.emit({ type: 'terminal-exit', id, code: -1 });
        resolve(-1);
      });
    });
    this.emit({ type: 'terminals', sessions: this.list() });
    return { id, name: session.name };
  }
  write(id, data) {
    const session = this.sessions.get(id);
    if (!session || session.exited) throw new Error('Terminal has exited.');
    if (typeof data !== 'string' || data.length > 65536) throw new Error('Terminal input is too large.');
    session.process.write(data);
  }
  resize(id, cols, rows) {
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) throw new Error('Invalid terminal size.');
    const session = this.sessions.get(id);
    if (!session || session.exited) return;
    session.process.resize(Math.max(20, Math.min(300, Math.floor(cols))), Math.max(5, Math.min(200, Math.floor(rows))));
  }
  close(id) {
    const session = this.sessions.get(id);
    if (session && !session.exited) { try { session.process.kill(); } catch { /* Process may have already exited. */ } }
    this.sessions.delete(id);
    this.emit({ type: 'terminals', sessions: this.list() });
  }
  dispose() { for (const id of this.sessions.keys()) this.close(id); }
}
module.exports = { Terminals };
