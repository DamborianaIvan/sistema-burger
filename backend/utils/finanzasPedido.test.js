import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDescuento, validarPagosCobro } from './finanzasPedido.js';

test('calcularDescuento conserva total original y calcula porcentaje', () => {
  assert.deepEqual(calcularDescuento(20000, 10), {
    porcentaje: 10,
    monto: 2000,
    totalFinal: 18000
  });
});

test('calcularDescuento admite un descuento del cien por ciento', () => {
  assert.deepEqual(calcularDescuento(15000, 100), {
    porcentaje: 100,
    monto: 15000,
    totalFinal: 0
  });
});

test('calcularDescuento rechaza porcentajes fuera de rango', () => {
  assert.throws(() => calcularDescuento(20000, -1));
  assert.throws(() => calcularDescuento(20000, 101));
});

test('validarPagosCobro acepta un cobro dividido que suma el total', () => {
  const pagos = validarPagosCobro([
    { metodo: 'EFECTIVO', monto: 8000 },
    { metodo: 'DEBITO', monto: 12000 }
  ], 20000);

  assert.equal(pagos.length, 2);
  assert.equal(pagos[0].monto + pagos[1].monto, 20000);
});

test('validarPagosCobro rechaza una suma menor o mayor al total', () => {
  assert.throws(() => validarPagosCobro([
    { metodo: 'EFECTIVO', monto: 10000 }
  ], 20000));

  assert.throws(() => validarPagosCobro([
    { metodo: 'EFECTIVO', monto: 21000 }
  ], 20000));
});

test('validarPagosCobro rechaza cobrar sin medios de pago', () => {
  assert.throws(() => validarPagosCobro([], 20000));
});

test('rechaza importes coercibles, no finitos o que redondearían a cero', () => {
  for (const monto of [true, null, {}, '', ' ', Infinity, 1e308, 0.001]) {
    assert.throws(() => validarPagosCobro([{ metodo: 'EFECTIVO', monto }], 1));
  }
  for (const porcentaje of [true, null, {}, '', ' ', Infinity]) {
    assert.throws(() => calcularDescuento(100, porcentaje));
  }
});


