import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrderTypes, validarModalidadHabilitada } from './modalidades.js';

test('la instalación nueva habilita delivery y takeaway, sin salón', () => {
  const tipos = parseOrderTypes();
  assert.deepEqual(tipos, ['DELIVERY', 'TAKEAWAY']);
  for (const tipo of tipos) assert.doesNotThrow(() => validarModalidadHabilitada(tipo, tipos));
  assert.throws(() => validarModalidadHabilitada('SALON', tipos), error => error.statusCode === 409);
});

test('salón se puede habilitar explícitamente sin eliminar su módulo', () => {
  const tipos = parseOrderTypes('salon, delivery,delivery,takeaway');
  assert.deepEqual(tipos, ['SALON', 'DELIVERY', 'TAKEAWAY']);
  assert.doesNotThrow(() => validarModalidadHabilitada('SALON', tipos));
});

test('una configuración vacía o desconocida falla sin habilitar modalidades de más', () => {
  for (const valor of ['', ',', 'DELIVERY,OTRO', 'DELIVERY,']) {
    assert.throws(() => parseOrderTypes(valor), /ORDER_TYPES/);
  }
});
