import test from 'node:test';
import assert from 'node:assert/strict';
import { prorratearImporteNeto, resolverRangoReportes } from './reportes.js';

test('resolverRangoReportes usa límites inclusivos de fecha argentina', () => {
  const rango = resolverRangoReportes('2026-09-01', '2026-09-01');

  assert.equal(rango.inicio.toISOString(), '2026-09-01T03:00:00.000Z');
  assert.equal(rango.finExclusivo.toISOString(), '2026-09-02T03:00:00.000Z');
  assert.equal(rango.dias, 1);
  assert.equal(rango.zonaHoraria, 'America/Argentina/Buenos_Aires');
});

test('resolverRangoReportes rechaza fechas inválidas e invertidas', () => {
  assert.throws(() => resolverRangoReportes('2026-02-30', '2026-03-01'));
  assert.throws(() => resolverRangoReportes('2026-09-10', '2026-09-01'));
});

test('prorratearImporteNeto distribuye descuentos proporcionalmente', () => {
  assert.equal(prorratearImporteNeto(6000, 10000, 8000), 4800);
  assert.equal(prorratearImporteNeto(4000, 10000, 8000), 3200);
});

