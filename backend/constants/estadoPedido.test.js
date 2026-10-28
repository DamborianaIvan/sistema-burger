import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS_PEDIDO, TIPOS_PEDIDO } from './pedido.js';
import { puedeTransicionarPedido } from './estadoPedido.js';

const { ABIERTO, CONFIRMADO, EN_COCINA, LISTO, EN_CAMINO, ENTREGADO, CANCELADO } = ESTADOS_PEDIDO;
const { SALON, DELIVERY, TAKEAWAY } = TIPOS_PEDIDO;

test('permite el flujo operativo principal de delivery', () => {
  assert.equal(puedeTransicionarPedido(ABIERTO, CONFIRMADO, DELIVERY), true);
  assert.equal(puedeTransicionarPedido(CONFIRMADO, EN_COCINA, DELIVERY), true);
  assert.equal(puedeTransicionarPedido(EN_COCINA, LISTO, DELIVERY), true);
  assert.equal(puedeTransicionarPedido(LISTO, EN_CAMINO, DELIVERY), true);
  assert.equal(puedeTransicionarPedido(EN_CAMINO, ENTREGADO, DELIVERY), true);
});

test('salón pasa de listo a servido y takeaway pasa de listo a entregado', () => {
  assert.equal(puedeTransicionarPedido(LISTO, ESTADOS_PEDIDO.SERVIDO, SALON), true);
  assert.equal(puedeTransicionarPedido(LISTO, ENTREGADO, SALON), false);
  assert.equal(puedeTransicionarPedido(LISTO, ENTREGADO, TAKEAWAY), true);
});

test('delivery pasa de listo a en camino', () => {
  assert.equal(puedeTransicionarPedido(LISTO, EN_CAMINO, DELIVERY), true);
  assert.equal(puedeTransicionarPedido(LISTO, ENTREGADO, DELIVERY), false);
});

test('permite cancelar pedidos no terminales', () => {
  assert.equal(puedeTransicionarPedido(ABIERTO, CANCELADO, SALON), true);
  assert.equal(puedeTransicionarPedido(CONFIRMADO, CANCELADO, DELIVERY), true);
  assert.equal(puedeTransicionarPedido(EN_COCINA, CANCELADO, TAKEAWAY), true);
  assert.equal(puedeTransicionarPedido(LISTO, CANCELADO, SALON), true);
  assert.equal(puedeTransicionarPedido(EN_CAMINO, CANCELADO, DELIVERY), true);
});

test('rechaza saltos de estado y modificaciones de estados terminales', () => {
  assert.equal(puedeTransicionarPedido(ABIERTO, EN_COCINA, SALON), false);
  assert.equal(puedeTransicionarPedido(CONFIRMADO, LISTO, SALON), false);
  assert.equal(puedeTransicionarPedido(EN_COCINA, ENTREGADO, SALON), false);
  assert.equal(puedeTransicionarPedido(ENTREGADO, ABIERTO, SALON), false);
  assert.equal(puedeTransicionarPedido(CANCELADO, CONFIRMADO, DELIVERY), false);
});

