const crypto = require('node:crypto');
const path = require('node:path');

class Tasks {
  constructor(workspaces, terminals, emit) { this.workspaces = workspaces; this.terminals = terminals; this.emit = emit; this.runs = new Map(); this.groups = new Map(); }
  async list() {
    const config = await this.workspaces.config('tasks', { tasks: [] });
    const tasks = Array.isArray(config.tasks) ? config.tasks : [];
    let scripts = {};
    try { scripts = JSON.parse(await this.workspaces.read(this.workspaces.active().prefix + 'package.json')).scripts ?? {}; }
    catch (error) { if (error.code !== 'ENOENT' && !/No such file|not found/i.test(error.message)) this.emit({ type: 'service-log', service: 'tasks', text: error.message }); }
    return [...tasks.map(task => ({ ...task, source: 'configuration' })), ...Object.keys(scripts).map(name => ({ label: `npm: ${name}`, type: 'shell', command: `npm run ${name}`, source: 'package.json' }))];
  }
  async run(label, activeFile) {
    const context = this.workspaces.active();
    const tasks = await this.list();
    const task = tasks.find(task => task.label === label);
    if (!task) throw new Error('Task not found. Refresh the task list.');
    await this.workspaces.approve(`Run task: ${label}?`, `${context.name}\n${task.command ?? 'Dependency task'}\n\nTasks and their dependencies can execute arbitrary commands. Save files before running.`);
    const group = { cancelled: false };
    const visited = new Set(), stack = new Set();
    const runOne = async current => {
      if (group.cancelled) throw new Error('Task group cancelled.');
      if (stack.has(current.label)) throw new Error('Circular task dependencies.');
      if (visited.has(current.label)) return;
      stack.add(current.label);
      const dependencies = typeof current.dependsOn === 'string' ? [current.dependsOn] : current.dependsOn ?? [];
      for (const name of dependencies) {
        const dependency = tasks.find(candidate => candidate.label === name);
        if (!dependency) throw new Error(`Missing dependency task: ${name}`);
        await runOne(dependency);
      }
      stack.delete(current.label); visited.add(current.label);
      if (!current.command) return;
      const expand = value => String(value).replaceAll('${workspaceFolder}', context.path).replaceAll('${file}', activeFile ? this.workspaces.locate(activeFile).context.kind === 'local' ? path.join(this.workspaces.locate(activeFile).context.path, this.workspaces.locate(activeFile).relative) : path.posix.join(this.workspaces.locate(activeFile).context.path, this.workspaces.locate(activeFile).relative) : '');
      const command = expand(current.command);
      const args = (current.args ?? []).map(expand);
      const windows = context.kind === 'local' && process.platform === 'win32';
      const quote = value => windows ? "'" + value.replaceAll("'", "''") + "'" : "'" + value.replaceAll("'", "'\\''") + "'";
      const shellCommand = [command, ...args.map(quote)].join(' ');
      const cwd = current.options?.cwd ? expand(current.options.cwd) : context.path;
      const library = context.kind === 'local' ? path : path.posix;
      const resolvedCwd = library.resolve(context.path, cwd);
      const relative = library.relative(context.path, resolvedCwd);
      if (relative === '..' || relative.startsWith('..' + library.sep) || library.isAbsolute(relative)) throw new Error('Task cwd must be within the selected workspace root.');
      const id = crypto.randomUUID();
      const options = current.type === 'process' ? { command, args } : {
        command: windows ? 'powershell.exe' : '/bin/sh',
        args: windows ? ['-NoLogo', '-NoProfile', '-Command', shellCommand] : ['-c', shellCommand],
      };
      const terminal = await this.terminals.create({ ...options, cwd: resolvedCwd, name: `Task: ${current.label}`, env: current.options?.env }, true, context);
      const run = { id, label: current.label, terminalId: terminal.id, status: 'running' };
      this.runs.set(id, run);
      this.groups.set(id, group);
      this.emit({ type: 'task', ...run });
      const code = await this.terminals.sessions.get(terminal.id).done;
      run.status = code === 0 && !group.cancelled ? 'succeeded' : 'failed'; run.code = group.cancelled ? -1 : code;
      this.emit({ type: 'task', ...run });
      if (code !== 0 || group.cancelled) throw new Error(`Task ${current.label} ${group.cancelled ? 'was cancelled' : `exited ${code}`}. See its terminal output.`);
    };
    // Dependencies run in order; return immediately so the UI remains usable during long-running tasks.
    void runOne(task).catch(error => this.emit({ type: 'service-log', service: 'tasks', text: error.message }));
    return { label };
  }
  stop(id) {
    const run = this.runs.get(id);
    if (run?.status === 'running') { const group = this.groups.get(id); if (group) group.cancelled = true; this.terminals.close(run.terminalId); }
  }
}
module.exports = { Tasks };
