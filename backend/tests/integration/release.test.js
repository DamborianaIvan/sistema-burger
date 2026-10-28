import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTEGRATION_ENABLED,
  conectarBaseDePrueba,
  desconectarBaseDePrueba,
  detenerServidorDePrueba,
  iniciarServidorDePrueba,
  requestJson
} from './testSetup.js';

describe('integración: QA de release', { skip: !INTEGRATION_ENABLED }, () => {
  before(async () => {
    await conectarBaseDePrueba();
    await iniciarServidorDePrueba();
  });

  after(async () => {
    await detenerServidorDePrueba();
    await desconectarBaseDePrueba();
  });

  test('healthcheck informa solo el estado mínimo del servicio', async () => {
    const { response, body } = await requestJson('/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok' });
  });

  test('respuestas incluyen headers básicos de seguridad', async () => {
    const { response } = await requestJson('/api/health');

    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(
      response.headers.get('permissions-policy'),
      'camera=(), microphone=(), geolocation=()'
    );
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  test('rutas inexistentes usan el contrato uniforme de errores', async () => {
    const { response, body } = await requestJson('/api/ruta-que-no-existe');

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    assert.equal(typeof body.error.message, 'string');
  });
});


