import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import app from '../server.js';

let server;
let url;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/no-existe`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const post = (body, headers = {}) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body
});

test('rechaza cuerpos comprimidos sin descomprimir y la API sigue respondiendo', async () => {
  for (const body of [gzipSync('{}'), Buffer.concat([gzipSync('{}'), Buffer.from('bytes-invalidos')])]) {
    const response = await post(body, { 'content-encoding': 'gzip' });
    assert.equal(response.status, 415);
    await response.arrayBuffer();
  }
  assert.equal((await post('{}')).status, 404);
});

test('rechaza JSON inválido, cuerpos no objeto y cuerpos mayores a 1 MiB', async () => {
  for (const body of ['{', 'null', 'true', '[]', '"texto"']) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post(JSON.stringify({ texto: 'x'.repeat(1024 * 1024) }))).status, 413);
  assert.equal((await post('{}')).status, 404);
});

