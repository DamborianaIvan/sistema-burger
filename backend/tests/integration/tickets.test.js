import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
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

describe('integración: tickets', { skip: !INTEGRATION_ENABLED }, () => {
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
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      rol: 'CAJERO'
    });
    await crearUsuario({
      nombre: 'Chef Test',
      nombreUsuario: 'chef-test',
      email: 'chef-test@example.com',
      rol: 'CHEF'
    });

    const [admin, cajero, chef] = await Promise.all([
      loginComo('admin-test', 'password-admin-123'),
      loginComo('cajero-test', 'password-admin-123'),
      loginComo('chef-test', 'password-admin-123')
    ]);

    return { admin, cajero, chef };
  };

  const crearPedidoTakeaway = async (token) => {
    const producto = await crearProducto({
      nombre: 'Pizza Ticket',
      precio: 10000
    });

    const { response, body } = await requestJson('/api/pedidos', {
      method: 'POST',
      headers: authorization(token),
      body: JSON.stringify({
        tipoPedido: 'TAKEAWAY',
        nombreCliente: 'Cliente Ticket',
        telefono: '123456',
        productos: [{ productoId: producto._id.toString(), cantidad: 2 }],
        comentario: 'Sin aceitunas'
      })
    });

    assert.equal(response.status, 201);
    return body;
  };


  test('ticket de venta requiere pago completo y refleja descuento y medios', async () => {
    const { cajero } = await prepararUsuarios();
    const pedido = await crearPedidoTakeaway(cajero.token);

    const pendiente = await requestJson(
      `/api/pedidos/${pedido._id}/ticket/venta`,
      { headers: authorization(cajero.token) }
    );
    assert.equal(pendiente.response.status, 409);

    const apertura = await requestJson('/api/caja/abrir', {
      method: 'POST',
      headers: authorization(cajero.token),
      body: JSON.stringify({ montoInicial: 5000 })
    });
    assert.equal(apertura.response.status, 201);

    const descuento = await requestJson(`/api/pedidos/${pedido._id}/descuento`, {
      method: 'PATCH',
      headers: authorization(cajero.token),
      body: JSON.stringify({ porcentaje: 10 })
    });
    assert.equal(descuento.response.status, 200);

    const cobro = await requestJson(`/api/pedidos/${pedido._id}/cobrar`, {
      method: 'POST',
      headers: authorization(cajero.token),
      body: JSON.stringify({
        pagos: [
          { metodo: 'EFECTIVO', monto: 8000 },
          { metodo: 'DEBITO', monto: 10000 }
        ]
      })
    });
    assert.equal(cobro.response.status, 200);

    const ticket = await requestJson(
      `/api/pedidos/${pedido._id}/ticket/venta`,
      { headers: authorization(cajero.token) }
    );

    assert.equal(ticket.response.status, 200);
    assert.equal(ticket.body.tipo, 'VENTA');
    assert.equal(ticket.body.totalOriginal, 20000);
    assert.equal(ticket.body.descuento.porcentaje, 10);
    assert.equal(ticket.body.descuento.monto, 2000);
    assert.equal(ticket.body.totalFinal, 18000);
    assert.deepEqual(ticket.body.pagos, [
      { metodo: 'EFECTIVO', monto: 8000 },
      { metodo: 'DEBITO', monto: 10000 }
    ]);
  });

  test('CHEF no puede generar ticket de venta', async () => {
    const { admin, chef } = await prepararUsuarios();
    const pedido = await crearPedidoTakeaway(admin.token);

    const venta = await requestJson(
      `/api/pedidos/${pedido._id}/ticket/venta`,
      { headers: authorization(chef.token) }
    );
    assert.equal(venta.response.status, 403);
  });
});

