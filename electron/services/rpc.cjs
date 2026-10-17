const { EventEmitter } = require('node:events');

// LSP and DAP share the same byte-framed transport. Never split a Unicode payload by characters.
class FramedPeer extends EventEmitter {
  constructor(child, protocol = 'lsp') {
    super();
    this.child = child;
    this.protocol = protocol;
    this.sequence = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    child.stdin.on('error', error => this.fail(error));
    child.stdout.on('data', data => this.receive(data));
    child.stderr.on('data', data => this.emit('log', data.toString()));
    child.on('error', error => this.fail(error));
    // close follows stdout/stderr drainage; exit can precede the last response.
    child.on('close', code => {
      this.fail(new Error(`Server exited (${code ?? 'signal'}).`));
      this.emit('exit', code);
    });
  }

  fail(error) {
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(error); }
    this.pending.clear();
    this.emit('log', error.message);
  }

  receive(data) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, data]);
    if (this.buffer.length > 64 * 1024 * 1024) {
      this.fail(new Error('Protocol message exceeds 64 MiB.'));
      this.child.kill();
      return;
    }
    while (true) {
      const boundary = this.buffer.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      const match = /Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0, boundary).toString());
      if (!match) { this.buffer = this.buffer.subarray(boundary + 4); continue; }
      const length = Number(match[1]);
      if (length > 64 * 1024 * 1024) { this.child.kill(); return this.fail(new Error('Protocol payload is too large.')); }
      if (this.buffer.length < boundary + 4 + length) return;
      const payload = this.buffer.subarray(boundary + 4, boundary + 4 + length);
      this.buffer = this.buffer.subarray(boundary + 4 + length);
      let message;
      try { message = JSON.parse(payload.toString()); }
      catch { this.emit('log', 'Invalid protocol JSON.'); continue; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { this.emit('log', 'Invalid protocol message.'); continue; }
      const id = this.protocol === 'dap' ? message.request_seq : message.id;
      const response = this.protocol === 'dap' ? message.type === 'response' : id !== undefined && !message.method;
      if (response && this.pending.has(id)) {
        const pending = this.pending.get(id);
        this.pending.delete(id);
        clearTimeout(pending.timer);
        if (message.error || message.success === false) pending.reject(new Error(message.error?.message ?? message.message ?? 'Protocol request failed.'));
        else pending.resolve(this.protocol === 'dap' ? message.body ?? {} : message.result);
      } else this.emit('message', message);
    }
  }

  send(message) {
    if (this.closed || this.child.stdin.destroyed || !this.child.stdin.writable) throw new Error('Server is not running.');
    const payload = Buffer.from(JSON.stringify(message));
    this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`), payload]));
  }

  request(method, params = {}, timeout = 30000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(this.protocol === 'dap'
          ? { seq: id, type: 'request', command: method, arguments: params }
          : { jsonrpc: '2.0', id, method, params });
      } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  notify(method, params) { this.send({ jsonrpc: '2.0', method, params }); }
  respond(id, result) { this.send({ jsonrpc: '2.0', id, result }); }
  dispose() { this.closed = true; this.fail(new Error('Server stopped.')); this.child.kill(); }
}
module.exports = { FramedPeer };
