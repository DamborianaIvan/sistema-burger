import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Ingrediente from '../../models/Ingrediente.js';
import MovimientoStock from '../../models/MovimientoStock.js';
import Pedido from '../../models/Pedido.js';
import Mesa from '../../models/Mesa.js';
import Receta from '../../models/Receta.js';
import Caja from '../../models/Caja.js';
import MovimientoCaja from '../../models/MovimientoCaja.js';
import { VariedadPrepizza } from '../../models/Prepizza.js';
import { registrarMovimientoManual } from '../../services/stockService.js';
import { moverStockPrepizza } from '../../services/prepizzasService.js';
import { cerrarPedidoOperativo, cancelarPedidoOperativo } from '../../services/operacionesPedidoService.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, crearProducto, crearUsuario, crearMesa,
  desconectarBaseDePrueba, detenerServidorDePrueba, iniciarServidorDePrueba,
  limpiarPedidos, limpiarUsuarios, loginComo, requestJson, authorization
} from './testSetup.js';

describe('integración: transacciones de stock y operación del salón', { skip: !INTEGRATION_ENABLED }, () => {
  let usuario;
  let token;
  let producto;
  let harina;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos(); await limpiarUsuarios();
    usuario = await crearUsuario();
    token = (await loginComo('admin-test', 'password-admin-123')).token;
    producto = await crearProducto();
    harina = await Ingrediente.create({ nombre: 'Harina', unidad: 'KG', stockActual: 10 });
    await Receta.create({ productoId: producto._id, componentes: [{ ingredienteId: harina._id, cantidad: 0.3 }] });
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const post = (path, datos = {}, method = 'POST') => requestJson(path, {
    method, headers: authorization(token), body: JSON.stringify(datos)
  });
  const salon = (mesaId) => post('/api/pedidos', {
    tipoPedido: 'SALON', mesaId: String(mesaId), productos: [{ productoId: String(producto._id), cantidad: 1 }]
  });
  const pedidoListo = (mesaId = null) => Pedido.create({
    tipoPedido: mesaId ? 'SALON' : 'TAKEAWAY', mesaId, nombreCliente: 'Cliente', telefono: '123',
    productos: [{ productoId: producto._id, nombreSnapshot: producto.nombre, cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
    total: 1000, totalFinal: 1000, estadoPedido: mesaId ? 'SERVIDO' : 'ENTREGADO', estadoPago: 'PAGADO'
  });
  const manual = (datos = {}) => registrarMovimientoManual({
    ingredienteId: harina._id, tipo: 'ENTRADA', cantidad: 2, usuarioId: usuario._id, ...datos
  });

  test('dos altas simultáneas no ocupan una mesa con dos pedidos', async () => {
    const mesa = await crearMesa();
    const r = await Promise.all([salon(mesa._id), salon(mesa._id)]);
    assert.deepEqual(r.map((x) => x.response.status).sort(), [201, 409]);
    assert.equal(await Pedido.countDocuments({ mesaId: mesa._id }), 1);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'OCUPADA');
  });

  test('una mesa marcada libre con un pedido histórico activo no admite otro pedido', async () => {
    const mesa = await crearMesa();
    await pedidoListo(mesa._id);
    assert.equal((await salon(mesa._id)).response.status, 409);
    assert.equal(await Pedido.countDocuments({ mesaId: mesa._id }), 1);
  });

  test('un fallo al guardar el pedido revierte la reserva de la mesa', async () => {
    const mesa = await crearMesa();
    const original = Pedido.create;
    Pedido.create = async function (...args) {
      await original.apply(this, args);
      throw new Error('Fallo simulado después del alta');
    };
    try { assert.equal((await salon(mesa._id)).response.status, 500); }
    finally { Pedido.create = original; }
    assert.equal(await Pedido.countDocuments({}), 0);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'LIBRE');
  });

  test('dos cierres del mismo pedido consumen ingredientes una sola vez', async () => {
    const mesa = await crearMesa({ estado: 'OCUPADA' });
    const pedido = await pedidoListo(mesa._id);
    const r = await Promise.all([post(`/api/pedidos/${pedido._id}/cerrar`), post(`/api/pedidos/${pedido._id}/cerrar`)]);
    assert.ok(r.every((x) => x.response.status === 200));
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 9.7);
    assert.equal(await MovimientoStock.countDocuments({ pedidoId: pedido._id }), 1);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'LIBRE');
  });

  test('cierres de pedidos distintos no pierden consumos sobre un mismo ingrediente', async () => {
    const [p1, p2] = await Promise.all([pedidoListo(), pedidoListo()]);
    await Promise.all([cerrarPedidoOperativo(p1._id, usuario._id), cerrarPedidoOperativo(p2._id, usuario._id)]);
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 9.4);
    assert.equal(await MovimientoStock.countDocuments({ tipo: 'CONSUMO' }), 2);
  });

  test('cerrar un pedido histórico no libera la mesa si todavía queda otro activo', async () => {
    const mesa = await crearMesa({ estado: 'OCUPADA' });
    const [p1, p2] = await Promise.all([pedidoListo(mesa._id), pedidoListo(mesa._id)]);
    await cerrarPedidoOperativo(p1._id, usuario._id);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'OCUPADA');
    await cerrarPedidoOperativo(p2._id, usuario._id);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'LIBRE');
  });

  test('una entrada manual y un cierre simultáneo conservan ambos movimientos', async () => {
    const pedido = await pedidoListo();
    await Promise.all([manual(), cerrarPedidoOperativo(pedido._id, usuario._id)]);
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 11.7);
    assert.equal(await MovimientoStock.countDocuments({ ingredienteId: harina._id }), 2);
  });

  test('un fallo en el segundo consumo revierte el pedido, la mesa y todos los ingredientes', async () => {
    const queso = await Ingrediente.create({ nombre: 'Queso', unidad: 'KG', stockActual: 5 });
    await Receta.updateOne({ productoId: producto._id }, { $push: { componentes: { ingredienteId: queso._id, cantidad: 0.2 } } });
    const mesa = await crearMesa({ estado: 'OCUPADA' });
    const pedido = await pedidoListo(mesa._id);
    const original = MovimientoStock.create;
    let escrituras = 0;
    MovimientoStock.create = async function (...args) {
      const resultado = await original.apply(this, args);
      if (++escrituras === 2) throw new Error('Fallo simulado en segundo consumo');
      return resultado;
    };
    try { await assert.rejects(cerrarPedidoOperativo(pedido._id, usuario._id)); }
    finally { MovimientoStock.create = original; }
    assert.equal(escrituras, 2);
    assert.equal((await Pedido.findById(pedido._id)).cierre.cerrado, false);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'OCUPADA');
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 10);
    assert.equal((await Ingrediente.findById(queso._id)).stockActual, 5);
    assert.equal(await MovimientoStock.countDocuments({ pedidoId: pedido._id }), 0);
  });

  test('un fallo en un movimiento manual no modifica el stock ni deja historial parcial', async () => {
    const original = MovimientoStock.create;
    MovimientoStock.create = async function (...args) {
      await original.apply(this, args); throw new Error('Fallo simulado de movimiento');
    };
    try { await assert.rejects(manual()); }
    finally { MovimientoStock.create = original; }
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 10);
    assert.equal(await MovimientoStock.countDocuments({}), 0);
  });

  test('un fallo del stock inicial tampoco deja creado el ingrediente', async () => {
    const original = MovimientoStock.create;
    MovimientoStock.create = async () => { throw new Error('Fallo simulado del stock inicial'); };
    try {
      const r = await post('/api/stock/ingredientes', { nombre: 'Ingrediente nuevo', unidad: 'KG', stockInicial: 2 });
      assert.equal(r.response.status, 500);
    } finally { MovimientoStock.create = original; }
    assert.equal(await Ingrediente.countDocuments({ nombre: 'Ingrediente nuevo' }), 0);
  });

  test('dos mermas concurrentes no permiten descontar más stock del disponible', async () => {
    const resultados = await Promise.allSettled([
      manual({ tipo: 'MERMA', cantidad: 8, motivo: 'Merma' }),
      manual({ tipo: 'MERMA', cantidad: 8, motivo: 'Merma' })
    ]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.find((r) => r.status === 'rejected').reason.statusCode, 409);
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 2);
    assert.equal(await MovimientoStock.countDocuments({}), 1);
  });

  test('las salidas manuales conservan el motivo opcional', async () => {
    const resultado = await manual({ tipo: 'SALIDA', cantidad: 1 });
    assert.equal(resultado.ingrediente.stockActual, 9);
    assert.equal(resultado.movimiento.motivo, '');
  });

  test('la producción de prepizzas y los movimientos manuales comparten el stock sin pisarse', async () => {
    const variedad = await VariedadPrepizza.create({ nombre: 'Clásica', precio: 1000, componentes: [{ ingredienteId: harina._id, cantidad: 0.3 }] });
    await Promise.all([manual(), moverStockPrepizza({
      claveOperacion: 'produccion-mixta', variedadId: variedad._id,
      tipo: 'PRODUCCION', cantidad: 2, consumirIngredientes: true
    }, usuario._id)]);
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, 11.4);
  });

  test('un fallo al liberar la mesa revierte también la cancelación', async () => {
    const mesa = await crearMesa({ estado: 'OCUPADA' });
    const pedido = await pedidoListo(mesa._id);
    await Pedido.updateOne({ _id: pedido._id }, { $set: { estadoPedido: 'EN_COCINA', estadoPago: 'PENDIENTE' } });
    const original = Mesa.prototype.save;
    Mesa.prototype.save = async function (...args) { await original.apply(this, args); throw new Error('Fallo simulado de mesa'); };
    try { await assert.rejects(cancelarPedidoOperativo(pedido._id)); }
    finally { Mesa.prototype.save = original; }
    assert.equal((await Pedido.findById(pedido._id)).estadoPedido, 'EN_COCINA');
    assert.equal((await Mesa.findById(mesa._id)).estado, 'OCUPADA');
  });

  test('eliminar un pedido abierto libera su mesa en la misma operación', async () => {
    const mesa = await crearMesa({ estado: 'OCUPADA' });
    const pedido = await pedidoListo(mesa._id);
    await Pedido.updateOne({ _id: pedido._id }, { $set: { estadoPedido: 'ABIERTO', estadoPago: 'PENDIENTE' } });
    assert.equal((await post(`/api/pedidos/${pedido._id}`, {}, 'DELETE')).response.status, 200);
    assert.equal(await Pedido.findById(pedido._id), null);
    assert.equal((await Mesa.findById(mesa._id)).estado, 'LIBRE');
  });

  test('un fallo en el movimiento de apertura no deja una caja abierta', async () => {
    const original = MovimientoCaja.create;
    MovimientoCaja.create = async function (...args) { await original.apply(this, args); throw new Error('Fallo simulado de apertura'); };
    try { assert.equal((await post('/api/caja/abrir', { montoInicial: 1000 })).response.status, 500); }
    finally { MovimientoCaja.create = original; }
    assert.equal(await Caja.countDocuments({}), 0);
    assert.equal(await MovimientoCaja.countDocuments({}), 0);
  });
});

