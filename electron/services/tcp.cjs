const net = require('node:net');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

async function connectTcp(options, context) {
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port;
  if (context.kind !== 'local' || !['127.0.0.1', 'localhost', '::1'].includes(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TCP language/debug adapters require a local root and a loopback host with port 1–65535. Remote TCP forwarding is not automatic.');
  const socket = net.createConnection({ host: host === 'localhost' ? '127.0.0.1' : host, port });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error(`TCP connection timed out (${host}:${port}). Start the engine/editor and enable its language/debug server first.`)); }, 5000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('error', error => { clearTimeout(timeout); reject(new Error(`Cannot connect to ${host}:${port}: ${error.message}`)); });
  });
  const peer = new EventEmitter();
  peer.on('error', () => {});
  peer.stdin = socket; peer.stdout = socket; peer.stderr = new PassThrough();
  peer.kill = () => { socket.destroy(); return true; };
  socket.on('error', error => peer.emit('error', error));
  socket.on('close', error => peer.emit('close', error ? -1 : 0));
  return peer;
}
module.exports = { connectTcp };
