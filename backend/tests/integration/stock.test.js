import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Ingrediente from '../../models/Ingrediente.js';
import MovimientoStock from '../../models/MovimientoStock.js';
import Pedido from '../../models/Pedido.js';
import Receta from '../../models/Receta.js';
import {
  INTEGRATION_ENABLED,
  authorization,
  conectarBaseDePrueba,
  crearProducto,
  crearUsuario,
  desconectarBaseDePrueba,
  detenerServidorDePrueba,
  iniciarServidorDePrueba,
  limpiarPedidos,
  limpiarUsuarios,
  loginComo,
  requestJson
} from './testSetup.js';

describe('integración: stock y recetas', { skip: !INTEGRATION_ENABLED }, () => {
  before(async () => {
    await conectarBaseDePrueba();
    await iniciarServidorDePrueba();
  });

  beforeEach(async () => {
    await limpiarPedidos();
    await limpiarUsuarios();
  });

  after(async () => {
    await detenerServidorDePrueba();
    await desconectarBaseDePrueba();
  });

  const prepararUsuarios = async () => {
    await crearUsuario();
    await crearUsuario({
      nombre: 'Cajero Stock',
      nombreUsuario: 'cajero-stock',
      email: 'cajero-stock@example.com',
      rol: 'CAJERO'
    });

    const [admin, cajero] = await Promise.all([
      loginComo('admin-test', 'password-admin-123'),
      loginComo('cajero-stock', 'password-admin-123')
    ]);

    return { admin, cajero };
  };

  test('ADMIN crea ingrediente y registra entrada; CAJERO no puede ajustar stock', async () => {
    const { admin, cajero } = await prepararUsuarios();

    const creacion = await requestJson('/api/stock/ingredientes', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombre: 'Harina 000',
        unidad: 'KG',
        stockMinimo: 5,
        stockInicial: 20
      })
    });

    assert.equal(creacion.response.status, 201);
    assert.equal(creacion.body.stockActual, 20);

    const movimientoCajero = await requestJson(
      '/api/stock/ingredientes/' + creacion.body._id + '/movimientos',
      {
        method: 'POST',
        headers: authorization(cajero.token),
        body: JSON.stringify({
          tipo: 'ENTRADA',
          cantidad: 5
        })
      }
    );

    assert.equal(movimientoCajero.response.status, 403);

    const movimientoAdmin = await requestJson(
      '/api/stock/ingredientes/' + creacion.body._id + '/movimientos',
      {
        method: 'POST',
        headers: authorization(admin.token),
        body: JSON.stringify({
          tipo: 'MERMA',
          cantidad: 2,
          motivo: 'Bolsa dañada'
        })
      }
    );

    assert.equal(movimientoAdmin.response.status, 201);
    assert.equal(movimientoAdmin.body.ingrediente.stockActual, 18);

    const movimientos = await MovimientoStock.find({
      ingredienteId: creacion.body._id
    }).sort({ fecha: 1 });

    assert.equal(movimientos.length, 2);
    assert.equal(movimientos[0].tipo, 'ENTRADA');
    assert.equal(movimientos[1].tipo, 'MERMA');
  });

  test('alertas devuelve ingredientes cuyo stock alcanzó el mínimo', async () => {
    const { admin } = await prepararUsuarios();

    const ingrediente = await Ingrediente.create({
      nombre: 'Mozzarella',
      unidad: 'KG',
      stockActual: 3,
      stockMinimo: 4,
      activo: true
    });

    const alertas = await requestJson('/api/stock/alertas', {
      headers: authorization(admin.token)
    });

    assert.equal(alertas.response.status, 200);
    assert.equal(alertas.body.length, 1);
    assert.equal(alertas.body[0]._id, ingrediente._id.toString());
    assert.equal(alertas.body[0].faltanteHastaMinimo, 1);
  });

  test('cerrar un pedido consume receta una sola vez y permite stock negativo', async () => {
    const { admin } = await prepararUsuarios();
    const producto = await crearProducto({
      nombre: 'Pizza Stock',
      precio: 12000
    });

    const harina = await Ingrediente.create({
      nombre: 'Harina',
      unidad: 'KG',
      stockActual: 0.4,
      stockMinimo: 1,
      activo: true
    });

    const queso = await Ingrediente.create({
      nombre: 'Queso',
      unidad: 'KG',
      stockActual: 1,
      stockMinimo: 0.5,
      activo: true
    });

    await Receta.create({
      productoId: producto._id,
      activa: true,
      componentes: [
        { ingredienteId: harina._id, cantidad: 0.25 },
        { ingredienteId: queso._id, cantidad: 0.15 }
      ]
    });

    const pedido = await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Cliente Stock',
      telefono: '123456',
      usuarioId: admin.id,
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 2,
        precioUnitario: producto.precio,
        subtotal: producto.precio * 2
      }],
      total: producto.precio * 2,
      totalFinal: producto.precio * 2,
      estadoPedido: 'ENTREGADO',
      estadoPago: 'PAGADO'
    });

    const cierre = await requestJson('/api/pedidos/' + pedido._id + '/cerrar', {
      method: 'POST',
      headers: authorization(admin.token)
    });

    assert.equal(cierre.response.status, 200);
    assert.equal(cierre.body.cierre.cerrado, true);

    const [harinaDespues, quesoDespues] = await Promise.all([
      Ingrediente.findById(harina._id),
      Ingrediente.findById(queso._id)
    ]);

    assert.equal(harinaDespues.stockActual, -0.1);
    assert.equal(quesoDespues.stockActual, 0.7);

    const consumos = await MovimientoStock.find({
      pedidoId: pedido._id,
      tipo: 'CONSUMO'
    }).sort({ ingredienteId: 1 });

    assert.equal(consumos.length, 2);

    const segundoCierre = await requestJson('/api/pedidos/' + pedido._id + '/cerrar', {
      method: 'POST',
      headers: authorization(admin.token)
    });

    assert.equal(segundoCierre.response.status, 200);

    const consumosDespues = await MovimientoStock.countDocuments({
      pedidoId: pedido._id,
      tipo: 'CONSUMO'
    });

    assert.equal(consumosDespues, 2);
    assert.equal((await Ingrediente.findById(harina._id)).stockActual, -0.1);
  });
});

