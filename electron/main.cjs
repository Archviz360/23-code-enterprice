const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { Workspaces } = require('./services/workspaces.cjs');
const { Terminals } = require('./services/terminals.cjs');
const { Tasks } = require('./services/tasks.cjs');
const { Extensions } = require('./services/extensions.cjs');
const { Languages } = require('./services/languages.cjs');
const { DebuggerService } = require('./services/debugger.cjs');
const { AI } = require('./services/ai.cjs');
const { parseGitStatus } = require('./services/git-status.cjs');
const { Engines } = require('./services/engines.cjs');
const { ExternalEditor } = require('./services/external-editor.cjs');

if (process.platform === 'win32') app.setAppUserModelId('org.23code.enterprise');
const profileArgument = process.argv.find(value => value.startsWith('--profile='));
if (profileArgument) app.setPath('userData', path.resolve(profileArgument.slice('--profile='.length)));
// Chromium may omit or reorder non-Chromium switches in second-instance argv.
// Preserve the original explicit editor arguments in Electron's structured handoff.
const primaryInstance = app.requestSingleInstanceLock({ argv: process.argv, cwd: process.cwd() });
if (!primaryInstance) app.quit();
let window, commandProcess;
const development = !app.isPackaged && process.argv.includes('--dev');
const emit = event => { if (window && !window.isDestroyed()) window.webContents.send('ide:event', event); };
const workspaces = new Workspaces(dialog, () => window);
const terminals = new Terminals(workspaces, emit);
const extensions = new Extensions(app, workspaces, emit);
const tasks = new Tasks(workspaces, terminals, emit);
const languages = new Languages(workspaces, extensions, emit);
const debuggerService = new DebuggerService(workspaces, emit);
const ai = new AI(app, workspaces, terminals, emit, shell);
const engines = new Engines(app, workspaces, terminals);
const externalEditor = new ExternalEditor(workspaces, emit, {
  replace: () => replaceGuard(),
  select: () => { if (ai.running.size) throw new Error('Stop the AI agent before switching project roots.'); },
  replaced: () => languages.dispose(),
});
if (primaryInstance) externalEditor.enqueue(process.argv);
app.on('second-instance', (_event, argv, cwd, data) => {
  externalEditor.enqueue(Array.isArray(data?.argv) && data.argv.every(value => typeof value === 'string') ? data.argv : argv, typeof data?.cwd === 'string' ? data.cwd : cwd);
  if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
});

function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted sender.');
    return callback(...args);
  });
}
function replaceGuard() {
  if (ai.running.size) throw new Error('Stop the AI agent before changing workspace folders.');
  if (commandProcess || debuggerService.session || debuggerService.starting || terminals.list().some(session => !session.exited)) throw new Error('Stop the debugger, running commands, and terminals before replacing the workspace. Adding a root does not require stopping them.');
}
async function replaceWorkspace(callback) {
  replaceGuard();
  const result = await callback();
  if (result) languages.dispose();
  return result;
}
handle('workspace:open', () => replaceWorkspace(() => workspaces.choose()));
handle('workspace:add', () => { if (ai.running.size) throw new Error('Stop the AI agent before adding a workspace folder.'); return workspaces.choose(true); });
handle('workspace:refresh', () => workspaces.snapshot());
handle('workspace:roots', () => ({ roots: workspaces.metadata(), activeRootId: workspaces.activeId }));
handle('workspace:select', id => { if (ai.running.size) throw new Error('Stop the AI agent before changing the active folder.'); workspaces.selected(id); return { roots: workspaces.metadata(), activeRootId: id }; });
handle('workspace:remove', async id => {
  if (ai.running.size) throw new Error('Stop the AI agent before removing workspace folders.');
  if (terminals.list().some(session => session.rootId === id && !session.exited) || debuggerService.session?.context.id === id) throw new Error('Stop this root’s terminals and debugger before removing it.');
  for (const session of languages.running()) if (session.rootId === id) languages.stop(session.id);
  return workspaces.remove(id);
});
handle('workspace:save', () => workspaces.saveDescriptor());
handle('workspace:load', () => replaceWorkspace(() => workspaces.loadDescriptor()));
handle('workspace:remote', (spec, add) => { if (ai.running.size) throw new Error('Stop the AI agent before connecting a remote folder.'); return add ? workspaces.connect(spec, true) : replaceWorkspace(() => workspaces.connect(spec)); });
handle('workspace:uri', virtual => workspaces.uri(virtual));
handle('workspace:virtual', (uri, rootId) => workspaces.virtual(uri, rootId));
handle('file:read', virtual => workspaces.read(virtual));
handle('file:write', (virtual, content, expected) => workspaces.write(virtual, content, expected));
handle('file:rename', (from, to) => workspaces.rename(from, to));
handle('file:delete', virtual => workspaces.delete(virtual));
handle('file:save-as', async (name, content) => {
  if (typeof name !== 'string' || typeof content !== 'string') throw new Error('Invalid file.');
  const result = await dialog.showSaveDialog(window, { defaultPath: path.basename(name) });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, content, 'utf8');
  return true;
});

// Git's `--` separates options, but does not disable wildcard pathspecs.
// A selected filename must never stage or unstage other matching files.
const git = (args, context = workspaces.active()) => workspaces.execute('git', ['--literal-pathspecs', ...args], context);
const gitChanges = async context => parseGitStatus(await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], context), context.prefix);
handle('git:status', async () => {
  const context = workspaces.active();
  const repository = (await git(['rev-parse', '--show-toplevel'], context)).trim();
  const canonical = context.kind === 'local' ? await fs.realpath(repository) : repository;
  if (canonical !== context.path) throw new Error('Open the Git repository root folder to use Source Control.');
  const changes = await gitChanges(context);
  return { branch: (await git(['branch', '--show-current'], context)).trim() || '(detached HEAD)', changes };
});
handle('git:action', async (action, value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A path or commit message is required.');
  if (action === 'commit') return git(['commit', '-m', value]);
  const { context, relative } = await workspaces.resolve(value);
  const paths = [relative];
  if (action === 'unstage' || action === 'diff') {
    const change = (await gitChanges(context)).find(change => change.path === value);
    if (change?.originalPath && (change.index === 'R' || change.working === 'R')) {
      const original = workspaces.locate(change.originalPath);
      if (original.context !== context) throw new Error('Rename source belongs to a different workspace root.');
      paths.push(original.relative);
    }
  }
  if (action === 'stage') return git(['add', '--', relative], context);
  if (action === 'unstage') {
    let hasHead = true;
    try { await git(['rev-parse', '--verify', 'HEAD'], context); } catch { hasHead = false; }
    return git(hasHead ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '-f', '--', ...paths], context);
  }
  if (action === 'diff') {
    // HEAD-to-working-tree can be empty even when the index contains changes.
    // Compare both sides of the index independently, including unborn HEADs.
    const [staged, unstaged] = await Promise.all([
      git(['diff', '--cached', '--', ...paths], context),
      git(['diff', '--', ...paths], context),
    ]);
    return [staged && `STAGED CHANGES\n${staged}`, unstaged && `UNSTAGED CHANGES\n${unstaged}`].filter(Boolean).join('\n\n') || 'No tracked diff (this may be an untracked file).';
  }
  throw new Error('Unsupported Git action.');
});

function stopCommand() {
  if (!commandProcess) return;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(commandProcess.pid), '/T', '/F'], () => {});
  else commandProcess.kill();
}
// Retain the bounded command API for automation and compatibility; the UI now uses real PTYs.
handle('shell:run', async command => {
  const context = workspaces.active();
  if (commandProcess) throw new Error('A command is already running.');
  if (typeof command !== 'string' || !command.trim() || command.length > 16000) throw new Error('Invalid command.');
  await workspaces.approve('Run shell command?', `Folder: ${context.path}\n\n${command}`);
  if (commandProcess) throw new Error('A command is already running.');
  const windows = context.kind === 'local' && process.platform === 'win32';
  const child = workspaces.spawn(windows ? 'powershell.exe' : '/bin/sh', windows ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command], context);
  commandProcess = child;
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { stderr += '\nCommand exceeded the 120-second limit.'; stopCommand(); }, 120000);
    child.stdout.on('data', data => { stdout += data; if (stdout.length + stderr.length > 2 * 1024 * 1024) stopCommand(); });
    child.stderr.on('data', data => { stderr += data; if (stdout.length + stderr.length > 2 * 1024 * 1024) stopCommand(); });
    child.on('error', error => { clearTimeout(timer); commandProcess = null; reject(error); });
    child.on('close', code => { clearTimeout(timer); commandProcess = null; resolve({ stdout, stderr, code: code ?? -1 }); });
  });
});
handle('shell:cancel', stopCommand);
handle('terminal:list', () => terminals.list());
handle('terminal:create', options => terminals.create({ cols: options?.cols, rows: options?.rows }));
handle('terminal:write', (id, data) => terminals.write(id, data));
handle('terminal:resize', (id, cols, rows) => terminals.resize(id, cols, rows));
handle('terminal:close', id => terminals.close(id));
handle('tasks:list', () => tasks.list());
handle('tasks:run', (label, file) => tasks.run(label, file));
handle('tasks:stop', id => tasks.stop(id));
handle('extensions:list', () => extensions.list());
handle('extensions:install', folder => extensions.install(Boolean(folder)));
handle('extensions:toggle', (id, enabled) => extensions.toggle(id, Boolean(enabled)));
handle('extensions:uninstall', id => extensions.uninstall(id));
handle('extensions:commands', () => extensions.commands());
handle('extensions:run', (id, command, context) => extensions.run(id, command, context));
handle('languages:list', () => languages.list());
handle('languages:running', () => languages.running());
handle('languages:start', id => languages.start(id));
handle('languages:stop', id => languages.stop(id));
handle('languages:document', (id, document) => languages.document(id, document));
handle('languages:request', (id, method, params) => languages.request(id, method, params));
handle('debug:configurations', () => debuggerService.configurations());
handle('debug:start', (name, file, breakpoints) => debuggerService.start(name, file, breakpoints));
handle('debug:breakpoints', (file, lines) => debuggerService.setBreakpoints(file, lines));
handle('debug:request', (command, args) => debuggerService.request(command, args));
handle('debug:stop', () => debuggerService.stop());
handle('ai:request', (action, input) => ai.request(action, input));
handle('engines:list', () => engines.list());
handle('engines:choose', directory => engines.choose(Boolean(directory)));
handle('engines:save', (id, profile, rootId) => engines.save(id, profile, rootId));
handle('engines:run', (id, action, rootId) => engines.run(id, action, rootId));
handle('external:pending', () => externalEditor.pending());
handle('external:accept', (id, replace) => externalEditor.accept(id, Boolean(replace)));
handle('external:reject', id => externalEditor.reject(id));

function dispose() { stopCommand(); terminals.dispose(); debuggerService.dispose(); languages.dispose(); extensions.dispose(); workspaces.dispose(); }
if (primaryInstance) app.whenReady().then(async () => {
  window = new BrowserWindow({ width: 1440, height: 950, minWidth: 800, minHeight: 600, backgroundColor: '#1f1f1f', title: '23 Code Enterprise',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const answer = dialog.showMessageBoxSync(window, { type: 'warning', message: 'There are unsaved files.', detail: 'Local recovery is not a disk save. Close anyway?', buttons: ['Keep editing', 'Close'], defaultId: 0, cancelId: 0 });
    if (answer === 1) event.preventDefault();
  });
  window.on('closed', dispose);
  if (development) await window.loadURL('http://127.0.0.1:5173');
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
  await extensions.initialize();
}).catch(error => { dialog.showErrorBox('Unable to start 23 Code Enterprise', error.stack ?? error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
let aiClosed = false;
// will-quit runs only after every window has accepted closure. A cancelled
// unsaved-file dialog must not shut down the still-visible editor's AI service.
app.on('will-quit', event => {
  event.preventDefault();
  if (aiClosed) return;
  aiClosed = true;
  // All windows have already accepted closure. Avoid re-entrant app.quit(),
  // which Electron can ignore when cleanup resolves inside the same quit turn.
  void ai.dispose().finally(() => app.exit(0));
});
