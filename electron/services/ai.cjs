const path = require('node:path');
const fs = require('node:fs/promises');
const { modify, applyEdits } = require('jsonc-parser');

const VERSION = '2.0.31';
const actions = new Set(['catalog', 'ollama', 'sessions', 'create', 'key', 'oauth', 'oauth-open', 'oauth-status', 'oauth-complete', 'oauth-cancel', 'terminal', 'disconnect', 'snapshot', 'prompt', 'stop', 'permission', 'form', 'form-cancel']);
const permissions = mode => [
  { action: '*', resource: '*', effect: 'ask' },
  ...['read', 'glob', 'grep', 'question'].map(action => ({ action, resource: '*', effect: 'allow' })),
  { action: 'read', resource: '*.env*', effect: 'ask' },
  { action: 'external_directory', resource: '*', effect: 'ask' },
  // Subagents have independent permission sets; keep panel sessions on the primary agent.
  { action: 'subagent', resource: '*', effect: 'deny' },
  ...(mode === 'plan' ? ['edit', 'shell'].map(action => ({ action, resource: '*', effect: 'deny' })) : []),
];
function executable(app) {
  if (app.isPackaged) return path.join(process.resourcesPath, 'opencode', 'opencode.exe');
  for (const pkg of ['cli-windows-x64-baseline', 'cli-windows-x64', 'cli']) {
    try { return path.join(path.dirname(require.resolve(`@opencode/${pkg}/package.json`)), 'bin', 'opencode.exe'); } catch { /* Try the next installed binary. */ }
  }
  throw new Error('Bundled OpenCode is missing. Run npm install and node scripts/prepare-opencode.cjs.');
}
class AI {
  constructor(app, workspaces, terminals, emit, shell) {
    Object.assign(this, { app, workspaces, terminals, emit, shell });
    this.directory = path.join(app.getPath('userData'), 'ai');
    this.env = Object.fromEntries(['CONFIG', 'DATA', 'STATE', 'CACHE'].map(kind => [`XDG_${kind}_HOME`, path.join(this.directory, kind.toLowerCase())]));
    this.file = path.join(this.env.XDG_STATE_HOME, 'opencode', 'service.json');
    this.sessionRoots = new Map(); this.attempts = new Map(); this.trusted = new Set(); this.trusting = new Map(); this.running = new Set(); this.submitting = new Set(); this.disposed = false;
  }
  async start() {
    if (this.disposed) throw new Error('AI service is closing.');
    if (!this.starting) this.starting = this.initialize().catch(error => { this.starting = null; throw error; });
    const client = await this.starting;
    if (this.disposed) throw new Error('AI service is closing.');
    // A cached SDK client is not proof that its native server is still alive.
    // Recover the connection before an operation; never replay a submitted prompt.
    if (Date.now() - (this.lastHealth ?? 0) > 3000) {
      if (!this.healthCheck) this.healthCheck = client.server.info({ signal: AbortSignal.timeout(2000) }).then(() => { this.lastHealth = Date.now(); }).catch(async () => {
        if (this.disposed) throw new Error('AI service is closing.');
        this.eventsAbort?.abort(); this.running.clear();
        this.starting = this.initialize().catch(error => { this.starting = null; throw error; });
        await this.starting; this.lastHealth = Date.now();
      }).finally(() => { this.healthCheck = null; });
      await this.healthCheck;
    }
    if (this.eventDisconnected && !this.disposed) {
      this.eventDisconnected = false;
      this.eventsAbort?.abort(); this.eventsAbort = new AbortController();
      this.consume(this.eventsAbort.signal);
    }
    return this.client;
  }
  async initialize() {
    const [{ OpenCode }, { Service }] = await Promise.all([import('@opencode/client'), import('@opencode/client/service')]);
    this.Service = Service;
    if (this.disposed) throw new Error('AI service is closing.');
    const endpoint = await Service.ensure({ file: this.file, version: VERSION, command: [executable(this.app), 'serve', '--service', '--hostname', '127.0.0.1'], env: this.env });
    if (!endpoint.auth) throw new Error('OpenCode did not enable local service authentication.');
    this.client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
    this.lastHealth = Date.now(); this.eventDisconnected = false;
    this.eventsAbort = new AbortController();
    this.consume(this.eventsAbort.signal);
    return this.client;
  }
  async consume(signal) {
    try {
      for await (const event of this.client.event.subscribe({ signal })) {
        if (event.data?.sessionID && this.sessionRoots.has(event.data.sessionID)) {
          if (event.type === 'session.execution.started') this.running.add(event.data.sessionID);
          if (['session.execution.succeeded', 'session.execution.failed', 'session.execution.interrupted'].includes(event.type)) this.running.delete(event.data.sessionID);
          this.emit({ type: 'ai-event', event });
        }
      }
    } catch (error) { if (!signal.aborted) this.emit({ type: 'service-log', service: 'AI', text: `Event stream disconnected: ${error.message}. Refresh AI to reconnect.` }); }
    finally { if (!signal.aborted) this.eventDisconnected = true; }
  }
  context() {
    const root = this.workspaces.active();
    if (root.kind !== 'local') throw new Error('AI currently requires a local folder. Remote roots are not sent to the local agent.');
    return root;
  }
  async check(sessionID) {
    if (typeof sessionID !== 'string') throw new Error('Invalid AI session.');
    const root = this.context();
    const session = await this.client.session.get({ sessionID });
    if (this.context().id !== root.id) throw new Error('The active folder changed. Retry in the current folder.');
    if (session.metadata?.client !== '23-code-enterprise' || path.resolve(session.location.directory) !== path.resolve(root.path)) throw new Error('AI session does not belong to the active folder.');
    this.sessionRoots.set(sessionID, root.id);
    return session;
  }
  async request(action, input = {}) {
    if (!actions.has(action) || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid AI request.');
    const context = this.context();
    if (!this.trusted.has(context.path)) {
      if (!this.trusting.has(context.path)) this.trusting.set(context.path, this.workspaces.approve('Enable AI for this trusted folder?', `Folder: ${context.path}\n\nOpenCode loads project configuration, plugins, MCP servers, and instructions. Only enable AI in trusted projects. Prompts and requested file contents are sent to the selected provider. Cloud usage may cost money. Edits and commands require approval in panel sessions. OpenCode is not a sandbox.`).then(() => this.trusted.add(context.path)).finally(() => this.trusting.delete(context.path)));
      await this.trusting.get(context.path);
    }
    const c = await this.start();
    if (this.context().id !== context.id) throw new Error('The active folder changed. Retry in the current folder.');
    const location = { directory: context.path };
    switch (action) {
      case 'catalog': {
        const [models, integrations, info] = await Promise.all([c.model.list({ location }), c.integration.list({ location }), c.server.info()]);
        return { models: models.data.map(({ id, providerID, name, enabled, capabilities, variants, limit, cost }) => ({ id, providerID, name, enabled, capabilities, variants: variants.map(({ id }) => ({ id })), limit, cost })), integrations: integrations.data.map(({ id, name, methods, connections }) => ({ id, name, methods, connections })), version: info.version };
      }
      case 'ollama': {
        const url = new URL(input.url || 'http://127.0.0.1:11434');
        if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['/', '/v1', '/v1/'].includes(url.pathname)) throw new Error('Use a local Ollama URL, for example http://127.0.0.1:11434.');
        const origin = url.origin;
        const response = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
        const inventory = await response.json();
        if (!Array.isArray(inventory.models)) throw new Error('Endpoint did not return an Ollama model inventory.');
        const config = path.join(this.env.XDG_CONFIG_HOME, 'opencode', 'opencode.jsonc');
        await fs.mkdir(path.dirname(config), { recursive: true });
        let text = await fs.readFile(config, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{\n  "$schema": "https://opencode.ai/config.json"\n}\n'; throw error; });
        text = applyEdits(text, modify(text, ['providers', 'ollama', 'settings', 'baseURL'], `${origin}/v1`, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
        await fs.writeFile(config, text, 'utf8');
        await c.location.reload({ location });
        return inventory.models.map(model => model.name).filter(name => typeof name === 'string');
      }
      case 'sessions': {
        const result = await c.session.list({ directory: location.directory, limit: 100 });
        const sessions = result.data.filter(s => s.metadata?.client === '23-code-enterprise' && path.resolve(s.location.directory) === path.resolve(location.directory));
        for (const s of sessions) this.sessionRoots.set(s.id, this.context().id);
        return sessions;
      }
      case 'create': {
        if (!['build', 'plan'].includes(input.mode)) throw new Error('Select Build or Plan.');
        const session = await c.session.create({ location, agent: input.mode, title: '23 Code AI', metadata: { client: '23-code-enterprise', mode: input.mode }, permissions: permissions(input.mode) });
        this.sessionRoots.set(session.id, this.context().id);
        return session;
      }
      case 'key': {
        if (typeof input.key !== 'string' || !input.key.trim() || input.key.length > 16000) throw new Error('Enter an API key.');
        await c.integration.connect.key({ integrationID: input.integrationID, key: input.key.trim(), location, answer: input.answer });
        return true;
      }
      case 'oauth': {
        const { data: attempt } = await c.integration.oauth.connect({ integrationID: input.integrationID, methodID: input.methodID, location, answer: input.answer });
        this.attempts.set(attempt.attemptID, { integrationID: input.integrationID, url: attempt.url, location });
        return attempt;
      }
      case 'oauth-open': {
        const attempt = this.attempts.get(input.attemptID);
        if (!attempt || !/^https:\/\//i.test(attempt.url)) throw new Error('Invalid OAuth URL.');
        await this.shell.openExternal(attempt.url); return true;
      }
      case 'oauth-status': case 'oauth-complete': case 'oauth-cancel': {
        const attempt = this.attempts.get(input.attemptID);
        if (!attempt) throw new Error('Unknown sign-in attempt.');
        const args = { integrationID: attempt.integrationID, attemptID: input.attemptID, location: attempt.location };
        if (action === 'oauth-status') return (await c.integration.oauth.status(args)).data;
        if (action === 'oauth-complete') await c.integration.oauth.complete({ ...args, code: input.code });
        else await c.integration.oauth.cancel(args);
        this.attempts.delete(input.attemptID); return true;
      }
      case 'terminal': {
        await this.workspaces.approve('Run native OpenCode?', `Folder: ${location.directory}\n\nOpens the complete bundled OpenCode TUI. Its own sessions and permissions apply, independently of the AI panel. Trust project configuration before proceeding.`);
        if (this.context().id !== context.id) throw new Error('The active folder changed. Retry in the current folder.');
        return this.terminals.create({ command: executable(this.app), args: [location.directory], name: 'OpenCode', env: this.env }, true, context);
      }
      case 'disconnect': {
        const credentials = await c.credential.list();
        const credential = credentials.find(entry => entry.id === input.credentialID);
        if (!credential) throw new Error('Unknown credential.');
        await this.workspaces.approve('Remove AI credential?', 'This removes the selected credential from this app’s OpenCode profile.');
        await c.credential.remove({ credentialID: input.credentialID }); return true;
      }
    }
    const session = await this.check(input.sessionID);
    const sessionID = session.id;
    switch (action) {
      case 'snapshot': {
        const [messages, permissions, forms, active, diffs, inbox] = await Promise.all([c.message.list({ sessionID, limit: 200, order: 'desc' }), c.permission.list({ sessionID }), c.session.form.list({ sessionID }), c.session.active(), c.session.diff({ sessionID }), c.session.inbox.list({ sessionID })]);
        const working = !!active[sessionID] || this.submitting.has(sessionID) || inbox.length > 0;
        if (working) this.running.add(sessionID); else this.running.delete(sessionID);
        return { session, messages: messages.data.reverse(), permissions, forms, active: working ? { type: 'running' } : null, diffs };
      }
      case 'prompt': {
        if (this.running.has(sessionID) || this.submitting.has(sessionID)) throw new Error('Wait for the running agent or stop it before sending another prompt.');
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 200000) throw new Error('Prompt must contain 1–200,000 characters.');
        if (!input.model || typeof input.model.id !== 'string' || typeof input.model.providerID !== 'string') throw new Error('Select a model.');
        this.running.add(sessionID); this.submitting.add(sessionID);
        try {
          // Reserve the session before asynchronous policy/model updates.
          await c.session.update({ sessionID, permissions: permissions(session.metadata.mode) });
          await c.session.switchModel({ sessionID, model: input.model });
          if (this.context().id !== context.id || this.disposed) throw new Error('The active folder changed or AI is closing.');
          return await c.session.prompt({ sessionID, text: input.text });
        } catch (error) { this.running.delete(sessionID); throw error; }
        finally { this.submitting.delete(sessionID); }
      }
      case 'stop': return c.session.interrupt({ sessionID });
      case 'permission': {
        if (!['once', 'reject'].includes(input.reply)) throw new Error('Only allow-once and reject are supported.');
        return c.permission.reply({ sessionID, requestID: input.requestID, decision: input.reply });
      }
      case 'form': return c.session.form.reply({ sessionID, formID: input.formID, answer: input.answer });
      case 'form-cancel': return c.session.form.cancel({ sessionID, formID: input.formID });
      default: throw new Error('Unsupported AI operation.');
    }
  }
  async dispose() {
    this.disposed = true;
    this.eventsAbort?.abort();
    if (this.Service) {
      try { await this.healthCheck; } catch { /* A health check may fail during shutdown. */ }
      try { await this.starting; } catch { /* Startup may already have failed. */ }
      this.eventsAbort?.abort();
      try { await this.Service.stop({ file: this.file, pty: 'clear' }); } catch { /* Service may have already stopped. */ }
    }
  }
}
module.exports = { AI, permissions, executable };
