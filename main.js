'use strict';
const readline = require('readline');
const {createRelay} = require('./relay');
let seq = 0;
const pending = new Map();
const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
function host(method, params = {}) {
  const id = 'relay-' + (++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Host call timed out: ' + method)); }, 15000);
    pending.set(id, {resolve, reject, timer});
    send({jsonrpc:'2.0', id, method, params});
  });
}
const relay = createRelay(host);
readline.createInterface({input:process.stdin}).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method && msg.id !== undefined) {
    Promise.resolve().then(() => {
      if (!['tool.invoke','hook.invoke','ui.invoke'].includes(msg.method)) throw new Error('Unknown method');
      const handler = relay[msg.params?.handler];
      if (!handler) throw new Error('Unknown handler');
      return handler(msg.params?.args || {});
    }).then(result => send({jsonrpc:'2.0',id:msg.id,result:result ?? {}}))
      .catch(e => send({jsonrpc:'2.0',id:msg.id,error:{code:'RELAY_ERROR',message:e.message}}));
  } else if (pending.has(msg.id)) {
    const item = pending.get(msg.id); pending.delete(msg.id); clearTimeout(item.timer);
    if (msg.error) item.reject(new Error(JSON.stringify(msg.error))); else item.resolve(msg.result);
  }
}).on('close', () => process.exit(0));
process.on('unhandledRejection', e => process.stderr.write(String(e?.message || e) + '\n'));
