import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Usuario from '../../models/Usuario.js';
import Pedido from '../../models/Pedido.js';
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

describe('integración: gestión de pedidos', { skip: !INTEGRATION_ENABLED }, () => {
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

  const crearPedidoConfirmado = async (adminToken) => {
    const producto = await crearProducto();
    const { response, body } = await requestJson('/api/pedidos', {
      method: 'POST',
      headers: authorization(adminToken),
      body: JSON.stringify({
        tipoPedido: 'TAKEAWAY',
        nombreCliente: 'Cliente Test',
        telefono: '123456',
        productos: [{ productoId: producto._id.toString(), cantidad: 1 }]
      })
    });
    assert.equal(response.status, 201);
    assert.equal(body.estadoPedido, 'EN_COCINA');
    return { pedido: body, producto };
  };

  const crearPedidoAbierto = async () => {
    const producto = await crearProducto();
    const pedido = await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Cliente Test',
      telefono: '123456',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      pagos: [],
      estadoPedido: 'ABIERTO',
      estadoPago: 'PENDIENTE'
    });
    return { pedido, producto };
  };

  test('GET /api/pedidos/cocina devuelve solo pedidos EN_COCINA ordenados por antigüedad', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const producto = await crearProducto();
    const primero = await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Primero',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      pagos: [],
      estadoPedido: 'EN_COCINA',
      estadoPago: 'PENDIENTE',
      fechaPedido: new Date('2026-01-01T10:00:00.000Z')
    });
    await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Listo',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      pagos: [],
      estadoPedido: 'LISTO',
      estadoPago: 'PENDIENTE',
      fechaPedido: new Date('2026-01-01T09:00:00.000Z')
    });

    const { response, body } = await requestJson('/api/pedidos/cocina', {
      headers: authorization(admin.token)
    });

    assert.equal(response.status, 200);
    assert.deepEqual(body.map((pedido) => pedido._id), [primero._id.toString()]);
  });

  test('CHEF puede consultar cocina y marcar pedidos como listos', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Chef Test',
      nombreUsuario: 'chef-test',
      email: 'chef-test@example.com',
      password: 'password-chef-123',
      rol: 'CHEF'
    });

    const chef = await loginComo('chef-test', 'password-chef-123');
    const { pedido } = await crearPedidoConfirmado((await loginComo('admin-test', 'password-admin-123')).token);

    const lista = await requestJson('/api/pedidos/cocina', {
      headers: authorization(chef.token)
    });
    assert.equal(lista.response.status, 200);
    assert.equal(lista.body[0]._id, pedido._id.toString());

    const listo = await requestJson(`/api/pedidos/${pedido._id}/listo`, {
      method: 'PATCH',
      headers: authorization(chef.token)
    });
    assert.equal(listo.response.status, 200);
    assert.equal(listo.body.estadoPedido, 'LISTO');
  });

  test('DELIVERY no puede acceder al contrato de cocina', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Delivery Test',
      nombreUsuario: 'delivery-test',
      email: 'delivery-test@example.com',
      password: 'password-delivery-123',
      rol: 'DELIVERY'
    });

    const delivery = await loginComo('delivery-test', 'password-delivery-123');

    const lista = await requestJson('/api/pedidos/cocina', {
      headers: authorization(delivery.token)
    });

    assert.equal(lista.response.status, 403);
  });

  test('PATCH /api/pedidos/:id/listo permite pasar de EN_COCINA a LISTO', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');
    const { pedido } = await crearPedidoConfirmado(admin.token);

    const { response, body } = await requestJson(`/api/pedidos/${pedido._id}/listo`, {
      method: 'PATCH',
      headers: authorization(admin.token)
    });

    assert.equal(response.status, 200);
    assert.equal(body.estadoPedido, 'LISTO');

    const persisted = await Pedido.findById(pedido._id);
    assert.equal(persisted.estadoPedido, 'LISTO');
  });

  test('PATCH /api/pedidos/:id/listo rechaza pedidos que ya no están en cocina', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');
    const { pedido } = await crearPedidoConfirmado(admin.token);

    await Pedido.findByIdAndUpdate(pedido._id, { estadoPedido: 'LISTO' });

    const { response } = await requestJson(`/api/pedidos/${pedido._id}/listo`, {
      method: 'PATCH',
      headers: authorization(admin.token)
    });

    assert.equal(response.status, 409);
  });

  test('GET /api/pedidos/cocina y PATCH /listo requieren autenticación', async () => {
    const lista = await requestJson('/api/pedidos/cocina');
    const listo = await requestJson('/api/pedidos/000000000000000000000000/listo', {
      method: 'PATCH'
    });

    assert.equal(lista.response.status, 401);
    assert.equal(listo.response.status, 401);
  });

  test('POST crea pedidos directamente en EN_COCINA', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const { pedido } = await crearPedidoConfirmado(admin.token);

    assert.equal(pedido.estadoPedido, 'EN_COCINA');
    assert.equal(pedido.estadoPago, 'PENDIENTE');
  });

  test('ADMIN puede editar un pedido abierto y conserva el precio histórico', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');
    const { pedido, producto } = await crearPedidoAbierto();

    await ProductoUpdatePrecio(producto._id, 1500);

    const { response, body } = await requestJson(`/api/pedidos/${pedido._id}`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({
        nombreCliente: 'Cliente Editado',
        telefono: '654321',
        productos: [{ productoId: producto._id.toString(), cantidad: 3 }]
      })
    });

    assert.equal(response.status, 200);
    assert.equal(body.nombreCliente, 'Cliente Editado');
    assert.equal(body.productos[0].precioUnitario, 1000);
    assert.equal(body.productos[0].subtotal, 3000);
    assert.equal(body.total, 3000);
  });

  test('CAJERO puede editar y CHEF no puede editar pedidos abiertos', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      password: 'password-cajero-123',
      rol: 'CAJERO'
    });
    await Usuario.create({
      nombre: 'Chef Test',
      nombreUsuario: 'chef-test',
      email: 'chef-test@example.com',
      password: 'password-chef-123',
      rol: 'CHEF'
    });

    const cajero = await loginComo('cajero-test', 'password-cajero-123');
    const chef = await loginComo('chef-test', 'password-chef-123');
    const { pedido, producto } = await crearPedidoAbierto();

    const editCajero = await requestJson(`/api/pedidos/${pedido._id}`, {
      method: 'PATCH',
      headers: authorization(cajero.token),
      body: JSON.stringify({
        productos: [{ productoId: producto._id.toString(), cantidad: 2 }]
      })
    });
    assert.equal(editCajero.response.status, 200);

    const editChef = await requestJson(`/api/pedidos/${pedido._id}`, {
      method: 'PATCH',
      headers: authorization(chef.token),
      body: JSON.stringify({
        productos: [{ productoId: producto._id.toString(), cantidad: 3 }]
      })
    });
    assert.equal(editChef.response.status, 403);
  });

  test('un pedido en cocina no puede editarse', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');
    const { pedido, producto } = await crearPedidoConfirmado(admin.token);

    const edit = await requestJson(`/api/pedidos/${pedido._id}`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({
        productos: [{ productoId: producto._id.toString(), cantidad: 2 }]
      })
    });

    assert.equal(edit.response.status, 409);
  });

  test('CAJERO puede cancelar un pedido y el pedido queda CANCELADO', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Cajero Test',
      nombreUsuario: 'cajero-test',
      email: 'cajero-test@example.com',
      password: 'password-cajero-123',
      rol: 'CAJERO'
    });

    const cajero = await loginComo('cajero-test', 'password-cajero-123');
    const { pedido } = await crearPedidoConfirmado((await loginComo('admin-test', 'password-admin-123')).token);

    const cancel = await requestJson(`/api/pedidos/${pedido._id}/cancelar`, {
      method: 'PATCH',
      headers: authorization(cajero.token),
      body: JSON.stringify({})
    });

    assert.equal(cancel.response.status, 200);
    assert.equal(cancel.body.estadoPedido, 'CANCELADO');

    const persisted = await Pedido.findById(pedido._id);
    assert.equal(persisted.estadoPedido, 'CANCELADO');
  });

  test('CHEF no puede cancelar un pedido', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Chef Test',
      nombreUsuario: 'chef-test',
      email: 'chef-test@example.com',
      password: 'password-chef-123',
      rol: 'CHEF'
    });

    const admin = await loginComo('admin-test', 'password-admin-123');
    const chef = await loginComo('chef-test', 'password-chef-123');
    const { pedido } = await crearPedidoConfirmado(admin.token);

    const cancel = await requestJson(`/api/pedidos/${pedido._id}/cancelar`, {
      method: 'PATCH',
      headers: authorization(chef.token),
      body: JSON.stringify({})
    });

    assert.equal(cancel.response.status, 403);
  });

  test('no se puede cancelar un pedido entregado', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');
    const { pedido } = await crearPedidoConfirmado(admin.token);

    for (const estadoPedido of ['LISTO', 'ENTREGADO']) {
      const transition = await requestJson(`/api/pedidos/${pedido._id}/estado`, {
        method: 'PATCH',
        headers: authorization(admin.token),
        body: JSON.stringify({ estadoPedido })
      });
      assert.equal(transition.response.status, 200);
    }

    const cancel = await requestJson(`/api/pedidos/${pedido._id}/cancelar`, {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({})
    });

    assert.equal(cancel.response.status, 409);
  });

  test('eliminación destructiva queda limitada a pedidos abiertos', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');
    const { pedido } = await crearPedidoAbierto();

    const eliminar = await requestJson(`/api/pedidos/${pedido._id}`, {
      method: 'DELETE',
      headers: authorization(admin.token)
    });

    assert.equal(eliminar.response.status, 200);
    assert.equal(await Pedido.findById(pedido._id), null);
  });
  test('DELIVERY solo consulta pedidos disponibles para reparto', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Delivery Test',
      nombreUsuario: 'delivery-test',
      email: 'delivery-test@example.com',
      password: 'password-delivery-123',
      rol: 'DELIVERY'
    });

    const delivery = await loginComo('delivery-test', 'password-delivery-123');
    const producto = await crearProducto();

    const disponible = await Pedido.create({
      tipoPedido: 'DELIVERY',
      nombreCliente: 'Cliente Delivery',
      telefono: '123456',
      direccion: 'Calle 123',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      totalFinal: producto.precio,
      estadoPedido: 'LISTO',
      estadoPago: 'PENDIENTE'
    });

    await Pedido.create({
      tipoPedido: 'DELIVERY',
      nombreCliente: 'Todavia Cocina',
      telefono: '123456',
      direccion: 'Calle 456',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      totalFinal: producto.precio,
      estadoPedido: 'EN_COCINA',
      estadoPago: 'PENDIENTE'
    });

    await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Takeaway',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      totalFinal: producto.precio,
      estadoPedido: 'LISTO',
      estadoPago: 'PENDIENTE'
    });

    const lista = await requestJson('/api/pedidos/delivery', {
      headers: authorization(delivery.token)
    });

    assert.equal(lista.response.status, 200);
    assert.deepEqual(lista.body.map((pedido) => pedido._id), [disponible._id.toString()]);
  });

  test('DELIVERY puede marcar como entregado un pedido disponible', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Delivery Test',
      nombreUsuario: 'delivery-test',
      email: 'delivery-test@example.com',
      password: 'password-delivery-123',
      rol: 'DELIVERY'
    });

    const delivery = await loginComo('delivery-test', 'password-delivery-123');
    const producto = await crearProducto();

    const pedido = await Pedido.create({
      tipoPedido: 'DELIVERY',
      nombreCliente: 'Cliente Delivery',
      telefono: '123456',
      direccion: 'Calle 123',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      totalFinal: producto.precio,
      estadoPedido: 'LISTO',
      estadoPago: 'PENDIENTE'
    });

    const entrega = await requestJson(`/api/pedidos/delivery/${pedido._id}/entregado`, {
      method: 'PATCH',
      headers: authorization(delivery.token)
    });

    assert.equal(entrega.response.status, 200);
    assert.equal(entrega.body.estadoPedido, 'ENTREGADO');

    const persistido = await Pedido.findById(pedido._id);
    assert.equal(persistido.estadoPedido, 'ENTREGADO');
  });

  test('DELIVERY no puede consultar ni cambiar pedidos por los endpoints genericos', async () => {
    await crearUsuario();
    await Usuario.create({
      nombre: 'Delivery Test',
      nombreUsuario: 'delivery-test',
      email: 'delivery-test@example.com',
      password: 'password-delivery-123',
      rol: 'DELIVERY'
    });

    const delivery = await loginComo('delivery-test', 'password-delivery-123');
    const producto = await crearProducto();
    const pedido = await Pedido.create({
      tipoPedido: 'DELIVERY',
      nombreCliente: 'Cliente Delivery',
      direccion: 'Calle 123',
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      totalFinal: producto.precio,
      estadoPedido: 'LISTO',
      estadoPago: 'PENDIENTE'
    });

    const listado = await requestJson('/api/pedidos', {
      headers: authorization(delivery.token)
    });
    assert.equal(listado.response.status, 403);

    const cambio = await requestJson(`/api/pedidos/${pedido._id}/estado`, {
      method: 'PATCH',
      headers: authorization(delivery.token),
      body: JSON.stringify({ estadoPedido: 'EN_CAMINO' })
    });
    assert.equal(cambio.response.status, 403);
  });

  test('otros roles no pueden usar el contrato exclusivo de DELIVERY', async () => {
    await crearUsuario();
    const admin = await loginComo('admin-test', 'password-admin-123');

    const lista = await requestJson('/api/pedidos/delivery', {
      headers: authorization(admin.token)
    });

    assert.equal(lista.response.status, 403);
  });


});

async function ProductoUpdatePrecio(id, precio) {
  const Producto = (await import('../../models/Producto.js')).default;
  await Producto.findByIdAndUpdate(id, { precio });
}

