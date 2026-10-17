const path = require('node:path');
const { FramedPeer } = require('./rpc.cjs');
const { connectTcp } = require('./tcp.cjs');

class DebuggerService {
  constructor(workspaces, emit) { this.workspaces = workspaces; this.emit = emit; this.session = null; this.breakpoints = {}; }
  async configurations() {
    const value = await this.workspaces.config('launch', { configurations: [] });
    return [{ name: 'Node: Debug active JavaScript file', type: 'node', request: 'launch', program: '${file}', builtin: true }, ...(value.configurations ?? [])];
  }
  async start(name, activeFile, breakpoints = {}) {
    if (this.starting || this.session) throw new Error('Stop the current debug session first.');
    this.starting = true;
    try { return await this.startNow(name, activeFile, breakpoints); }
    finally { this.starting = false; }
  }
  async startNow(name, activeFile, breakpoints = {}) {
    if (this.session) throw new Error('Stop the current debug session first.');
    const config = (await this.configurations()).find(value => value.name === name);
    if (!config) throw new Error('Debug configuration not found.');
    const context = this.workspaces.active();
    const source = activeFile ? await this.workspaces.resolve(activeFile) : null;
    if (config.program?.includes('${file}') && source && source.context.id !== context.id) throw new Error('Select the active file’s workspace root before debugging it.');
    const nativeFile = source?.full ?? '';
    const expand = value => typeof value === 'string' ? value.replaceAll('${workspaceFolder}', context.path).replaceAll('${file}', nativeFile) : value;
    const configuration = Object.fromEntries(Object.entries(config).map(([key, value]) => [key, Array.isArray(value) ? value.map(expand) : expand(value)]));
    if (configuration.type === 'node' && context.kind !== 'local') throw new Error('For remote debugging configure a DAP adapter installed on the target. The bundled Node adapter runs locally.');
    await this.workspaces.approve(`Start debugger: ${name}?`, `${configuration.program ?? configuration.adapter?.command ?? name}\n\nDebugging runs the program and adapter with your user permissions. Debugging reads saved files on disk.`);
    if (this.workspaces.active().id !== context.id) throw new Error('The active workspace changed while starting the debugger.');
    let child;
    if (configuration.type === 'node') {
      if (!configuration.program || !/\.(c?js|mjs)$/i.test(configuration.program)) throw new Error('The bundled Node debugger supports saved JavaScript files. Compile TypeScript first, or configure a DAP adapter.');
      child = this.workspaces.spawn(process.execPath, [path.join(__dirname, '../node-debug-adapter.cjs')], context, { env: { ELECTRON_RUN_AS_NODE: '1' } });
    } else {
      if (configuration.adapter?.tcp) child = await connectTcp(configuration.adapter.tcp, context);
      else {
        if (!configuration.adapter?.command) throw new Error('Custom debugging needs adapter.command/adapter.args or a loopback adapter.tcp in launch.json.');
        child = this.workspaces.spawn(configuration.adapter.command, configuration.adapter.args ?? [], context);
      }
    }
    try { if (this.workspaces.active().id !== context.id) throw new Error('Workspace changed while connecting to the debug adapter.'); }
    catch (error) { child.kill(); throw error; }
    const peer = new FramedPeer(child, 'dap');
    const session = { peer, context, state: 'starting', name, threadId: 1 };
    this.session = session; this.breakpoints = breakpoints;
    peer.on('log', text => this.emit({ type: 'debug-output', text }));
    peer.on('exit', () => { if (this.session === session) { this.session = null; this.emit({ type: 'debug-state', state: 'stopped' }); } });
    peer.on('message', async message => {
      if (message.type === 'request') {
        peer.send({ seq: ++peer.sequence, type: 'response', request_seq: message.seq, command: message.command, success: false, message: 'Reverse adapter requests are not supported.' });
        return;
      }
      if (message.type !== 'event') return;
      if (message.event === 'initialized') {
        try {
          for (const [file, lines] of Object.entries(this.breakpoints)) await this.setBreakpoints(file, lines);
          await peer.request('configurationDone');
        } catch (error) { this.emit({ type: 'debug-output', text: error.message }); await this.stop(); }
      }
      if (message.event === 'stopped') {
        session.state = 'paused'; session.threadId = message.body.threadId ?? 1;
        this.emit({ type: 'debug-state', state: 'paused', reason: message.body.reason, threadId: session.threadId });
      }
      if (message.event === 'continued') { session.state = 'running'; this.emit({ type: 'debug-state', state: 'running' }); }
      if (message.event === 'output') this.emit({ type: 'debug-output', text: message.body.output });
      if (message.event === 'terminated') void this.stop();
    });
    try {
      const capabilities = await peer.request('initialize', { clientID: '23-code', adapterID: configuration.type, linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path', supportsVariableType: true });
      session.capabilities = capabilities;
      const { adapter, builtin, ...launch } = configuration;
      void adapter; void builtin;
      await peer.request(configuration.request ?? 'launch', { ...launch, program: configuration.program ? path.isAbsolute(configuration.program) || context.kind !== 'local' ? configuration.program : path.resolve(context.path, configuration.program) : undefined, cwd: configuration.cwd ?? context.path }, 60000);
      if (session.state === 'starting') { session.state = 'running'; this.emit({ type: 'debug-state', state: 'running', name }); }
      return { name };
    } catch (error) { await this.stop(); throw error; }
  }
  async setBreakpoints(virtual, lines) {
    if (!Array.isArray(lines) || lines.some(line => !Number.isInteger(line) || line < 1)) throw new Error('Invalid breakpoint lines.');
    this.breakpoints[virtual] = lines;
    const session = this.session;
    if (!session) return;
    const { context, full } = await this.workspaces.resolve(virtual);
    if (context.id !== session.context.id) return;
    return session.peer.request('setBreakpoints', { source: { path: full }, breakpoints: lines.map(line => ({ line })) });
  }
  async request(command, args = {}) {
    const session = this.session;
    if (!session) throw new Error('No active debug session.');
    if (!['threads', 'stackTrace', 'scopes', 'variables', 'evaluate', 'continue', 'next', 'stepIn', 'stepOut', 'pause'].includes(command)) throw new Error('Unsupported debug request.');
    const result = await session.peer.request(command, { threadId: session.threadId, ...args });
    if (command === 'stackTrace') for (const frame of result.stackFrames ?? []) {
      const sourcePath = frame.source?.path;
      if (sourcePath) {
        const uri = session.context.kind === 'local' ? require('node:url').pathToFileURL(sourcePath).toString() : 'file://' + sourcePath;
        frame.virtualPath = this.workspaces.virtual(uri, session.context.id);
      }
    }
    return result;
  }
  async stop() {
    const session = this.session;
    if (!session) return;
    this.session = null;
    try { await session.peer.request('disconnect', { terminateDebuggee: true }, 2000); } catch { /* A crashed adapter may already be gone. */ }
    session.peer.dispose(); this.emit({ type: 'debug-state', state: 'stopped' });
  }
  dispose() { void this.stop(); }
}
module.exports = { DebuggerService };
