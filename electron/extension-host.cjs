// Extensions execute in a separate Node process, not inside the renderer. This is isolation, NOT a security sandbox.
const path = require('node:path');
const fs = require('node:fs');
const directory = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
const handlers = new Map();
const send = message => { if (process.connected) process.send(message); };
const api = Object.freeze({
  commands: Object.freeze({ registerCommand(id, callback) {
    if (typeof id !== 'string' || typeof callback !== 'function') throw new Error('Invalid command registration.');
    handlers.set(id, callback);
    return { dispose: () => handlers.delete(id) };
  } }),
  window: Object.freeze({ showInformationMessage: text => send({ type: 'message', text: String(text) }) }),
  version: '0.2.0',
});
process.on('message', async message => {
  if (message.type !== 'command') return;
  try {
    const callback = handlers.get(message.command);
    if (!callback) throw new Error('Extension command is not registered.');
    const result = await callback(message.context);
    send({ type: 'result', id: message.id, result: typeof result === 'string' ? { text: result } : result ?? {} });
  } catch (error) { send({ type: 'result', id: message.id, error: error.message }); }
});
Promise.resolve().then(async () => {
  const entry = path.resolve(directory, manifest.main);
  if (!entry.startsWith(directory + path.sep)) throw new Error('Extension entry escapes its directory.');
  const extension = require(entry);
  if (typeof extension.activate !== 'function') throw new Error('Extension must export activate(api).');
  await extension.activate(api);
  send({ type: 'ready', commands: [...handlers.keys()] });
}).catch(error => { send({ type: 'failed', error: error.message }); process.exitCode = 1; });
