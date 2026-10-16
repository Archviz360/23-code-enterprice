// Minimal DAP adapter backed by Node's real Inspector protocol. The debuggee is a separate process.
const { spawn } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');
const path = require('node:path');
let sequence = 0, inspectorSequence = 0, debuggee, socket, configuration;
let buffer = Buffer.alloc(0), pausedFrames = [], firstPause = true, terminated = false;
const requests = new Map(), references = new Map(), breakpointIds = new Map();
let nextReference = 1;
function send(message) {
  const data = Buffer.from(JSON.stringify({ seq: ++sequence, ...message }));
  process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${data.length}\r\n\r\n`), data]));
}
const event = (name, body = {}) => send({ type: 'event', event: name, body });
function inspector(method, params = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Debugger is not connected.'));
  const id = ++inspectorSequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`${method} timed out.`)); }, 15000);
    requests.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function reference(objectId) { if (!objectId) return 0; const id = nextReference++; references.set(id, objectId); return id; }
function display(value) { return value?.description ?? (typeof value?.value === 'string' ? JSON.stringify(value.value) : String(value?.value ?? value?.type ?? 'undefined')); }
function kill() {
  if (debuggee && debuggee.exitCode === null) {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(debuggee.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else debuggee.kill();
  }
  socket?.close();
}
async function launch(args) {
  if (debuggee) throw new Error('A debuggee is already running.');
  if (typeof args.program !== 'string' || !path.isAbsolute(args.program)) throw new Error('A saved JavaScript program is required.');
  configuration = args;
  debuggee = spawn(process.execPath, ['--inspect-brk=127.0.0.1:0', args.program, ...(args.args ?? [])], {
    cwd: args.cwd ?? path.dirname(args.program), env: { ...process.env, ...args.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  debuggee.stdout.on('data', data => event('output', { category: 'stdout', output: data.toString() }));
  debuggee.on('exit', code => { if (!terminated) { terminated = true; event('exited', { exitCode: code ?? -1 }); event('terminated'); } socket?.close(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { kill(); reject(new Error('Inspector did not start.')); }, 15000);
    let stderr = '', connected = false;
    debuggee.on('error', error => { clearTimeout(timer); reject(error); });
    debuggee.stderr.on('data', async data => {
      const text = data.toString(); stderr += text;
      event('output', { category: 'stderr', output: text });
      if (text.includes('Waiting for the debugger to disconnect')) socket?.close();
      const match = /ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/.exec(stderr);
      if (!match || connected) return;
      connected = true;
      socket = new WebSocket(match[0]);
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Inspector connection failed.')); });
      socket.addEventListener('message', async e => {
        const message = JSON.parse(String(e.data));
        if (message.id && requests.has(message.id)) {
          const pending = requests.get(message.id); requests.delete(message.id); clearTimeout(pending.timer);
          if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result ?? {});
        } else if (message.method === 'Debugger.paused') {
          pausedFrames = message.params.callFrames;
          if (firstPause && !configuration.stopOnEntry && !message.params.hitBreakpoints?.length) {
            firstPause = false; await inspector('Debugger.resume'); return;
          }
          firstPause = false;
          event('stopped', { reason: message.params.hitBreakpoints?.length ? 'breakpoint' : message.params.reason === 'exception' ? 'exception' : 'step', threadId: 1, allThreadsStopped: true });
        } else if (message.method === 'Debugger.resumed') event('continued', { threadId: 1, allThreadsContinued: true });
      });
      socket.addEventListener('open', async () => {
        try { await inspector('Runtime.enable'); await inspector('Debugger.enable'); clearTimeout(timer); resolve(); }
        catch (error) { clearTimeout(timer); reject(error); }
      });
    });
  });
}
async function handle(command, args) {
  switch (command) {
    case 'initialize': return { supportsConfigurationDoneRequest: true, supportsEvaluateForHovers: true, supportsTerminateRequest: true, supportsSetVariable: false };
    case 'launch': await launch(args); setImmediate(() => event('initialized')); return {};
    case 'setBreakpoints': {
      const source = args.source?.path;
      if (typeof source !== 'string') throw new Error('Breakpoint source path is required.');
      for (const id of breakpointIds.get(source) ?? []) await inspector('Debugger.removeBreakpoint', { breakpointId: id });
      const ids = [], breakpoints = [];
      for (const point of args.breakpoints ?? []) {
        const result = await inspector('Debugger.setBreakpointByUrl', { url: pathToFileURL(source).toString(), lineNumber: Math.max(0, point.line - 1), condition: point.condition ?? '' });
        ids.push(result.breakpointId); breakpoints.push({ verified: true, line: point.line });
      }
      breakpointIds.set(source, ids); return { breakpoints };
    }
    case 'configurationDone': await inspector('Runtime.runIfWaitingForDebugger'); return {};
    case 'threads': return { threads: [{ id: 1, name: 'Node main thread' }] };
    case 'stackTrace': return { stackFrames: pausedFrames.map((frame, index) => {
      let source = frame.url;
      try { if (source.startsWith('file:')) source = fileURLToPath(source); } catch { /* Built-in scripts can have non-file URLs. */ }
      return { id: index + 1, name: frame.functionName || '(anonymous)', source: { name: path.basename(source || configuration.program), path: source || configuration.program }, line: frame.location.lineNumber + 1, column: frame.location.columnNumber + 1 };
    }), totalFrames: pausedFrames.length };
    case 'scopes': return { scopes: (pausedFrames[args.frameId - 1]?.scopeChain ?? []).map(scope => ({ name: scope.name || scope.type, variablesReference: reference(scope.object.objectId), expensive: scope.type === 'global' })) };
    case 'variables': {
      const objectId = references.get(args.variablesReference);
      if (!objectId) return { variables: [] };
      const result = await inspector('Runtime.getProperties', { objectId, ownProperties: true, generatePreview: true });
      return { variables: (result.result ?? []).filter(item => item.value).map(item => ({ name: item.name, value: display(item.value), type: item.value.type, variablesReference: reference(item.value.objectId) })) };
    }
    case 'evaluate': {
      const frame = pausedFrames[(args.frameId ?? 1) - 1];
      const result = await inspector(frame ? 'Debugger.evaluateOnCallFrame' : 'Runtime.evaluate', { ...(frame ? { callFrameId: frame.callFrameId } : {}), expression: args.expression, generatePreview: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return { result: display(result.result), variablesReference: reference(result.result?.objectId), type: result.result?.type };
    }
    case 'continue': pausedFrames = []; await inspector('Debugger.resume'); return { allThreadsContinued: true };
    case 'next': await inspector('Debugger.stepOver'); return {};
    case 'stepIn': await inspector('Debugger.stepInto'); return {};
    case 'stepOut': await inspector('Debugger.stepOut'); return {};
    case 'pause': await inspector('Debugger.pause'); return {};
    case 'disconnect': case 'terminate': kill(); setTimeout(() => process.exit(0), 50); return {};
    default: throw new Error(`Unsupported debug request: ${command}`);
  }
}
process.stdin.on('data', data => {
  buffer = Buffer.concat([buffer, data]);
  while (true) {
    const boundary = buffer.indexOf('\r\n\r\n');
    if (boundary < 0) return;
    const length = Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, boundary).toString())?.[1]);
    if (!length || length > 1024 * 1024) return kill();
    if (buffer.length < boundary + 4 + length) return;
    const request = JSON.parse(buffer.subarray(boundary + 4, boundary + 4 + length).toString());
    buffer = buffer.subarray(boundary + 4 + length);
    Promise.resolve().then(() => handle(request.command, request.arguments ?? {})).then(body => send({ type: 'response', request_seq: request.seq, command: request.command, success: true, body }), error => send({ type: 'response', request_seq: request.seq, command: request.command, success: false, message: error.message }));
  }
});
process.stdin.on('end', () => { kill(); process.exit(0); });
process.on('exit', kill);
