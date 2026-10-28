import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Pedido from '../../models/Pedido.js';
import Mesa from '../../models/Mesa.js';
import {
  INTEGRATION_ENABLED,
  authorization,
  conectarBaseDePrueba,
  crearMesa,
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

describe('integración: caja y pagos', { skip: !INTEGRATION_ENABLED }, () => {
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

  const prepararAdmin = async () => {
    await crearUsuario();
    return loginComo('admin-test', 'password-admin-123');
  };

  const abrirCaja = async (token, montoInicial = 5000) =>
    requestJson('/api/caja/abrir', {
      method: 'POST',
      headers: authorization(token),
      body: JSON.stringify({ montoInicial })
    });

  const crearPedidoTakeaway = async (token) => {
    const producto = await crearProducto({ precio: 10000 });
    const { response, body } = await requestJson('/api/pedidos', {
      method: 'POST',
      headers: authorization(token),
      body: JSON.stringify({
        tipoPedido: 'TAKEAWAY',
        nombreCliente: 'Cliente Test',
        telefono: '123456',
        productos: [{ productoId: producto._id.toString(), cantidad: 2 }]
      })
    });
    assert.equal(response.status, 201);
    return body;
  };

  test('abre una única caja y calcula arqueo al cerrar', async () => {
    const admin = await prepararAdmin();

    const apertura = await abrirCaja(admin.token, 5000);
    assert.equal(apertura.response.status, 201);
    assert.equal(apertura.body.estado, 'ABIERTA');

    const repetida = await abrirCaja(admin.token, 1000);
    assert.equal(repetida.response.status, 409);

    const cierre = await requestJson('/api/caja/cerrar', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({ efectivoDeclarado: 5000 })
    });

    assert.equal(cierre.response.status, 200);
    assert.equal(cierre.body.estado, 'CERRADA');
    assert.equal(cierre.body.efectivoEsperado, 5000);
    assert.equal(cierre.body.diferencia, 0);
  });

  test('aplica descuento porcentual y cobra con múltiples medios', async () => {
    const admin = await prepararAdmin();
    await abrirCaja(admin.token);
    const pedido = await crearPedidoTakeaway(admin.token);

    const descuento = await requestJson(`/api/pedidos/${pedido._id}/descuento`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ porcentaje: 10 })
    });

    assert.equal(descuento.response.status, 200);
    assert.equal(descuento.body.total, 20000);
    assert.equal(descuento.body.descuento.monto, 2000);
    assert.equal(descuento.body.totalFinal, 18000);

    const cobroIncompleto = await requestJson(`/api/pedidos/${pedido._id}/cobrar`, {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        pagos: [{ metodo: 'EFECTIVO', monto: 10000 }]
      })
    });
    assert.equal(cobroIncompleto.response.status, 409);

    const cobro = await requestJson(`/api/pedidos/${pedido._id}/cobrar`, {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        pagos: [
          { metodo: 'EFECTIVO', monto: 8000 },
          { metodo: 'DEBITO', monto: 10000 }
        ]
      })
    });

    assert.equal(cobro.response.status, 200);
    assert.equal(cobro.body.estadoPago, 'PAGADO');
    assert.equal(cobro.body.pagos.length, 2);

    const caja = await requestJson('/api/caja/actual', {
      headers: authorization(admin.token)
    });
    assert.equal(caja.body.totalesPorMetodo.EFECTIVO, 8000);
    assert.equal(caja.body.totalesPorMetodo.DEBITO, 10000);
  });

  test('un descuento del cien por ciento deja el pedido pagado sin movimientos de cobro', async () => {
    const admin = await prepararAdmin();
    await abrirCaja(admin.token);
    const pedido = await crearPedidoTakeaway(admin.token);

    const descuento = await requestJson(`/api/pedidos/${pedido._id}/descuento`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ porcentaje: 100 })
    });

    assert.equal(descuento.response.status, 200);
    assert.equal(descuento.body.totalFinal, 0);
    assert.equal(descuento.body.estadoPago, 'PAGADO');
    assert.equal(descuento.body.pagos.length, 0);

    const caja = await requestJson('/api/caja/actual', {
      headers: authorization(admin.token)
    });
    assert.equal(caja.body.totalesPorMetodo.EFECTIVO, 0);
    assert.equal(caja.body.totalesPorMetodo.TRANSFERENCIA, 0);
    assert.equal(caja.body.totalesPorMetodo.DEBITO, 0);
    assert.equal(caja.body.totalesPorMetodo.CREDITO, 0);
  });

  test('anula el cobro completo sin borrar el historial', async () => {
    const admin = await prepararAdmin();
    await abrirCaja(admin.token);
    const pedido = await crearPedidoTakeaway(admin.token);

    await requestJson(`/api/pedidos/${pedido._id}/cobrar`, {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        pagos: [{ metodo: 'EFECTIVO', monto: 20000 }]
      })
    });

    const anulacion = await requestJson(`/api/pedidos/${pedido._id}/anular-cobro`, {
      method: 'POST',
      headers: authorization(admin.token)
    });

    assert.equal(anulacion.response.status, 200);
    assert.equal(anulacion.body.estadoPago, 'ANULADO');
    assert.equal(anulacion.body.pagos[0].estado, 'ANULADO');

    const caja = await requestJson('/api/caja/actual', {
      headers: authorization(admin.token)
    });
    assert.equal(caja.body.totalesPorMetodo.EFECTIVO, 0);
  });

  test('cierra un pedido de salón pagado y libera la mesa', async () => {
    const admin = await prepararAdmin();
    await abrirCaja(admin.token);
    const producto = await crearProducto({ precio: 10000 });
    const mesa = await crearMesa();

    const alta = await requestJson('/api/pedidos', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        tipoPedido: 'SALON',
        mesaId: mesa._id.toString(),
        productos: [{ productoId: producto._id.toString(), cantidad: 1 }]
      })
    });
    const pedidoId = alta.body._id;

    await requestJson(`/api/pedidos/${pedidoId}/listo`, {
      method: 'PATCH',
      headers: authorization(admin.token)
    });
    await requestJson(`/api/pedidos/${pedidoId}/estado`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ estadoPedido: 'SERVIDO' })
    });
    await requestJson(`/api/pedidos/${pedidoId}/cobrar`, {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        pagos: [{ metodo: 'EFECTIVO', monto: 10000 }]
      })
    });

    const antes = await Mesa.findById(mesa._id);
    assert.equal(antes.estado, 'OCUPADA');

    const cierre = await requestJson(`/api/pedidos/${pedidoId}/cerrar`, {
      method: 'POST',
      headers: authorization(admin.token)
    });

    assert.equal(cierre.response.status, 200);
    assert.equal(cierre.body.cierre.cerrado, true);

    const mesaFinal = await Mesa.findById(mesa._id);
    assert.equal(mesaFinal.estado, 'LIBRE');

    const persistido = await Pedido.findById(pedidoId);
    assert.equal(persistido.estadoPago, 'PAGADO');
  });
});

