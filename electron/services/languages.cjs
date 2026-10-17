const { FramedPeer } = require('./rpc.cjs');
const { pathToFileURL } = require('node:url');
const { existsSync } = require('node:fs');
const { connectTcp } = require('./tcp.cjs');
const path = require('node:path');
const allowed = new Set(['textDocument/completion', 'completionItem/resolve', 'textDocument/hover', 'textDocument/definition', 'textDocument/references', 'textDocument/prepareRename', 'textDocument/rename', 'textDocument/formatting', 'textDocument/signatureHelp', 'textDocument/documentSymbol', 'textDocument/codeAction']);

class Languages {
  constructor(workspaces, extensions, emit) { this.workspaces = workspaces; this.extensions = extensions; this.emit = emit; this.sessions = new Map(); this.starting = new Map(); }
  async list() {
    const context = this.workspaces.active();
    const config = await this.workspaces.config('languages', { servers: [] });
    const contributions = (await this.extensions.list()).filter(extension => extension.enabled).flatMap(extension => extension.manifest.contributes?.languageServers ?? []);
    const builtin = context.kind === 'local' ? [{ id: 'builtin-python', name: 'Python · bundled Pyright', languages: ['python'], builtin: 'pyright' }] : [];
    return [...builtin, ...(config.servers ?? []), ...contributions].map(server => ({ ...server, running: this.sessions.has(`${context.id}:${server.id}`) }));
  }
  async start(id) {
    const context = this.workspaces.active();
    const key = `${context.id}:${id}`;
    if (this.starting.has(key)) return this.starting.get(key);
    const job = this.startNow(id, context);
    this.starting.set(key, job);
    try { return await job; } finally { this.starting.delete(key); }
  }
  async startNow(id, context) {
    const config = (await this.list()).find(server => server.id === id);
    if (!config || !Array.isArray(config.languages) || !config.languages.length) throw new Error('Invalid language-server configuration.');
    const sessionId = `${context.id}:${id}`;
    if (this.sessions.has(sessionId)) return this.public(this.sessions.get(sessionId));
    await this.workspaces.approve('Start language server?', `${config.name ?? id}\n${config.tcp ? `TCP ${config.tcp.host ?? '127.0.0.1'}:${config.tcp.port}` : config.builtin ? 'Bundled Pyright' : `${config.command} ${(config.args ?? []).join(' ')}`}\nRoot: ${context.path}\n\nA language server is executable code with your user permissions. External servers must already be installed in the selected local/remote environment.`);
    if (this.workspaces.active().id !== context.id) throw new Error('The active workspace changed while starting the language server.');
    const library = context.kind === 'local' ? path : path.posix;
    const serverRoot = config.root ? library.resolve(context.path, String(config.root).replaceAll('${workspaceFolder}', context.path)) : context.path;
    const relativeRoot = library.relative(context.path, serverRoot).replaceAll('\\', '/');
    if (relativeRoot === '..' || relativeRoot.startsWith('../') || library.isAbsolute(relativeRoot)) throw new Error('Language-server root must be inside the workspace root.');
    const bundledEntry = require.resolve('pyright/langserver.index.js');
    // Pyright uses native filesystem/worker paths internally; its resources must live outside ASAR.
    const unpackedEntry = bundledEntry.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    const child = config.tcp ? await connectTcp(config.tcp, context) : config.builtin === 'pyright'
      ? this.workspaces.spawn(process.execPath, [existsSync(unpackedEntry) ? unpackedEntry : bundledEntry, '--stdio'], context, { cwd: serverRoot, env: { ELECTRON_RUN_AS_NODE: '1' } })
      : this.workspaces.spawn(config.command, config.args ?? [], context, { cwd: serverRoot });
    try { if (this.workspaces.active().id !== context.id) throw new Error('Workspace changed while connecting to the language server.'); }
    catch (error) { child.kill(); throw error; }
    const peer = new FramedPeer(child);
    const rootUri = context.kind === 'local' ? pathToFileURL(serverRoot).toString() : 'file://' + serverRoot.split('/').map(encodeURIComponent).join('/');
    const session = { id: sessionId, rootId: context.id, configId: id, languages: config.languages, peer, documents: new Map(), rootUri, pathPrefix: context.prefix + (relativeRoot ? relativeRoot + '/' : '') };
    this.sessions.set(sessionId, session);
    peer.on('log', text => this.emit({ type: 'service-log', service: `lsp:${id}`, text }));
    peer.on('exit', () => { if (this.sessions.get(sessionId) === session) this.sessions.delete(sessionId); this.emit({ type: 'language-stopped', id: sessionId }); });
    peer.on('message', message => {
      if (message.method === 'textDocument/publishDiagnostics') {
        const virtual = this.workspaces.virtual(message.params.uri, context.id);
        if (virtual) this.emit({ type: 'diagnostics', sessionId, path: virtual, diagnostics: message.params.diagnostics ?? [] });
      } else if (message.id !== undefined && message.method) {
        if (message.method === 'workspace/configuration') peer.respond(message.id, message.params.items.map(() => config.settings ?? {}));
        else if (['client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create'].includes(message.method)) peer.respond(message.id, null);
        else if (message.method === 'workspace/workspaceFolders') peer.respond(message.id, [{ uri: rootUri, name: context.name }]);
        else if (message.method === 'workspace/applyEdit') peer.respond(message.id, { applied: false, failureReason: 'Unsolicited workspace edits are not permitted. Use editor refactoring commands.' });
        else peer.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported client request' } });
      } else if (message.method === 'window/logMessage' || message.method === 'window/showMessage') this.emit({ type: 'service-log', service: `lsp:${id}`, text: message.params.message });
    });
    try {
      const response = await peer.request('initialize', {
        processId: process.pid, rootUri, workspaceFolders: [{ uri: rootUri, name: context.name }],
        clientInfo: { name: '23 Code Enterprise', version: require('../../package.json').version },
        capabilities: {
          workspace: { configuration: true, workspaceFolders: true, applyEdit: false },
          textDocument: {
            synchronization: { didSave: true },
            completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] } },
            hover: { contentFormat: ['markdown', 'plaintext'] }, definition: { linkSupport: true },
            rename: { prepareSupport: true }, publishDiagnostics: { relatedInformation: false },
            codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] } } },
          },
        }, initializationOptions: config.initializationOptions,
      }, 60000);
      session.capabilities = response.capabilities;
      peer.notify('initialized', {});
      peer.notify('workspace/didChangeConfiguration', { settings: config.settings ?? {} });
      const result = this.public(session);
      this.emit({ type: 'language-started', session: result });
      return result;
    } catch (error) { this.stop(sessionId); throw error; }
  }
  public(session) { return { id: session.id, rootId: session.rootId, languages: session.languages, capabilities: session.capabilities ?? {}, pathPrefix: session.pathPrefix }; }
  running() { return [...this.sessions.values()].map(session => this.public(session)); }
  document(id, document) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.pathPrefix && !document.path.startsWith(session.pathPrefix)) return;
    const { context } = this.workspaces.locate(document.path);
    if (context.id !== session.rootId || !session.languages.includes(document.language)) return;
    const uri = this.workspaces.uri(document.path);
    const previous = session.documents.get(uri);
    if (previous?.text === document.text && previous.language === document.language) return uri;
    if (previous && previous.language !== document.language) {
      session.peer.notify('textDocument/didClose', { textDocument: { uri } });
      session.documents.delete(uri);
      return this.document(id, document);
    }
    if (!previous) {
      session.documents.set(uri, { version: 1, text: document.text, language: document.language });
      session.peer.notify('textDocument/didOpen', { textDocument: { uri, languageId: document.language, version: 1, text: document.text } });
    } else {
      const version = previous.version + 1;
      session.documents.set(uri, { version, text: document.text, language: document.language });
      const sync = session.capabilities?.textDocumentSync;
      const kind = typeof sync === 'number' ? sync : sync?.change;
      if (kind === 0) return uri;
      const lines = previous.text.split(/\r\n|\r|\n/);
      const change = kind === 2 ? { range: { start: { line: 0, character: 0 }, end: { line: lines.length - 1, character: lines.at(-1).length } }, text: document.text } : { text: document.text };
      session.peer.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [change] });
    }
    return uri;
  }
  request(id, method, params) {
    const session = this.sessions.get(id);
    if (!session || !allowed.has(method)) throw new Error('Language server is not running, or the request is unsupported.');
    return session.peer.request(method, params);
  }
  stop(id) { const session = this.sessions.get(id); this.sessions.delete(id); session?.peer.dispose(); this.emit({ type: 'language-stopped', id }); }
  dispose() { for (const id of this.sessions.keys()) this.stop(id); }
}
module.exports = { Languages };
