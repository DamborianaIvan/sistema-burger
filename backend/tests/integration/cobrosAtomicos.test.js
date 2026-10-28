import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Pedido from '../../models/Pedido.js';
import Caja from '../../models/Caja.js';
import MovimientoCaja from '../../models/MovimientoCaja.js';
import { cobrarPedido, anularCobroPedido } from '../../services/cobrosService.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, crearUsuario, crearProducto,
  desconectarBaseDePrueba, detenerServidorDePrueba, iniciarServidorDePrueba,
  limpiarUsuarios, limpiarPedidos, loginComo, requestJson, authorization
} from './testSetup.js';

describe('integración: cobros tradicionales atómicos', { skip: !INTEGRATION_ENABLED }, () => {
  let token;
  let usuario;
  let producto;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos(); await limpiarUsuarios();
    usuario = await crearUsuario();
    token = (await loginComo('admin-test', 'password-admin-123')).token;
    producto = await crearProducto({ precio: 1000 });
    assert.equal((await post('/api/caja/abrir', { montoInicial: 0 })).response.status, 201);
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const post = (path, datos = {}) => requestJson(path, {
    method: 'POST', headers: authorization(token), body: JSON.stringify(datos)
  });
  const crearPedido = async () => {
    const r = await post('/api/pedidos', {
      tipoPedido: 'TAKEAWAY', nombreCliente: 'Cliente', telefono: '123',
      productos: [{ productoId: String(producto._id), cantidad: 1 }]
    });
    assert.equal(r.response.status, 201);
    return r.body;
  };
  const cobrar = (id) => post(`/api/pedidos/${id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] });

  test('dos cobros simultáneos del mismo pedido registran un solo pago', async () => {
    const pedido = await crearPedido();
    const resultados = await Promise.all([cobrar(pedido._id), cobrar(pedido._id)]);
    assert.deepEqual(resultados.map((r) => r.response.status).sort(), [200, 409]);
    assert.equal((await Pedido.findById(pedido._id)).pagos.length, 1);
    assert.equal(await MovimientoCaja.countDocuments({ pedidoId: pedido._id, tipo: 'PAGO' }), 1);
    assert.equal((await Caja.findOne({ estado: 'ABIERTA' })).totalesPorMetodo.EFECTIVO, 1000);
  });

  test('cobros de pedidos distintos no pierden incrementos de caja', async () => {
    const pedidos = await Promise.all([crearPedido(), crearPedido(), crearPedido()]);
    const resultados = await Promise.all(pedidos.map((p) => cobrar(p._id)));
    assert.ok(resultados.every((r) => r.response.status === 200));
    assert.equal((await Caja.findOne({ estado: 'ABIERTA' })).totalesPorMetodo.EFECTIVO, 3000);
    assert.equal(await MovimientoCaja.countDocuments({ tipo: 'PAGO' }), 3);
  });

  test('un fallo después de escribir movimientos revierte caja, pedido y movimientos', async () => {
    const pedido = await crearPedido();
    const crearOriginal = MovimientoCaja.create;
    MovimientoCaja.create = async function (...args) {
      await crearOriginal.apply(this, args);
      throw new Error('Fallo simulado después de escribir el movimiento');
    };
    try {
      await assert.rejects(cobrarPedido(pedido._id, { pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] }, usuario._id));
    } finally { MovimientoCaja.create = crearOriginal; }
    assert.equal((await Caja.findOne({ estado: 'ABIERTA' })).totalesPorMetodo.EFECTIVO, 0);
    const persistido = await Pedido.findById(pedido._id);
    assert.equal(persistido.estadoPago, 'PENDIENTE');
    assert.equal(persistido.pagos.length, 0);
    assert.equal(await MovimientoCaja.countDocuments({ pedidoId: pedido._id }), 0);
  });

  test('dos anulaciones simultáneas revierten el importe una sola vez', async () => {
    const pedido = await crearPedido(); await cobrar(pedido._id);
    const resultados = await Promise.all([
      post(`/api/pedidos/${pedido._id}/anular-cobro`), post(`/api/pedidos/${pedido._id}/anular-cobro`)
    ]);
    assert.deepEqual(resultados.map((r) => r.response.status).sort(), [200, 409]);
    assert.equal((await Caja.findOne({ estado: 'ABIERTA' })).totalesPorMetodo.EFECTIVO, 0);
    assert.equal(await MovimientoCaja.countDocuments({ pedidoId: pedido._id, tipo: 'ANULACION_PAGO' }), 1);
  });

  test('un fallo al anular conserva el cobro y los totales originales', async () => {
    const pedido = await crearPedido(); await cobrar(pedido._id);
    const crearOriginal = MovimientoCaja.create;
    MovimientoCaja.create = async function (...args) {
      await crearOriginal.apply(this, args);
      throw new Error('Fallo simulado en la anulación');
    };
    try { await assert.rejects(anularCobroPedido(pedido._id, usuario._id)); }
    finally { MovimientoCaja.create = crearOriginal; }
    const persistido = await Pedido.findById(pedido._id);
    assert.equal(persistido.estadoPago, 'PAGADO');
    assert.equal(persistido.pagos[0].estado, 'ACTIVO');
    assert.equal((await Caja.findOne({ estado: 'ABIERTA' })).totalesPorMetodo.EFECTIVO, 1000);
    assert.equal(await MovimientoCaja.countDocuments({ pedidoId: pedido._id, tipo: 'ANULACION_PAGO' }), 0);
  });

  test('el cierre de caja y un cobro simultáneo nunca dejan pagos fuera del arqueo', async () => {
    const pedido = await crearPedido();
    const [pago, cierre] = await Promise.all([cobrar(pedido._id), post('/api/caja/cerrar', { efectivoDeclarado: 0 })]);
    assert.ok([200, 409].includes(pago.response.status));
    assert.ok([200, 409].includes(cierre.response.status));
    const caja = await Caja.findOne();
    if (caja.estado === 'CERRADA') assert.equal(caja.efectivoEsperado, pago.response.status === 200 ? 1000 : 0);
    assert.equal(await MovimientoCaja.countDocuments({ pedidoId: pedido._id, tipo: 'PAGO' }), pago.response.status === 200 ? 1 : 0);
  });


});

