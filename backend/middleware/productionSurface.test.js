import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.NODE_ENV = 'production';
const { default: app } = await import('../server.js');
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
test('Swagger está deshabilitado en producción, incluidos sus recursos', async () => {
  for (const path of ['/api-docs', '/api-docs/', '/api-docs/swagger-ui-init.js']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});
test('el healthcheck sin conexión revela únicamente el estado mínimo', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { status: 'degraded' });
});

