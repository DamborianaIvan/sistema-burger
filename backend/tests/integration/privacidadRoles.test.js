import test, { before, beforeEach, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import Pedido from '../../models/Pedido.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, desconectarBaseDePrueba,
  iniciarServidorDePrueba, detenerServidorDePrueba, limpiarPedidos, limpiarUsuarios,
  crearUsuario, crearProducto, crearMesa, loginComo, requestJson, authorization
} from './testSetup.js';

describe('integración: privacidad y mínimos permisos', { skip: !INTEGRATION_ENABLED }, () => {
  const tokens = {};
  let pedido;
  let producto;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos(); await limpiarUsuarios();
    for (const rol of ['ADMIN', 'CAJERO', 'CHEF', 'DELIVERY']) {
      await crearUsuario({ nombreUsuario: rol, email: `${rol}@test.com`, rol });
      tokens[rol] = (await loginComo(rol, 'password-admin-123')).token;
    }
    producto = await crearProducto();
    pedido = await Pedido.create({
      tipoPedido: 'DELIVERY', nombreCliente: 'CLIENTE-PRIVADO', direccion: 'DOMICILIO-PRIVADO', telefono: 'TELEFONO-PRIVADO',
      productos: [{ productoId: producto._id, nombreSnapshot: 'Pizza', categoriaSnapshot: 'Pizzas', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
      total: 1000, totalFinal: 1000, comentario: 'Sin sal', estadoPedido: 'EN_COCINA'
    });
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const get = (path, rol) => requestJson(path, { headers: rol ? authorization(tokens[rol]) : {} });

  test('productos y categorías requieren sesión; los roles operativos no reciben precios del catálogo', async () => {
    for (const path of ['/api/productos', `/api/productos/${producto._id}`, '/api/categorias-producto']) {
      assert.equal((await get(path)).response.status, 401);
      for (const rol of ['ADMIN', 'CAJERO']) assert.equal((await get(path, rol)).response.status, 200);
      for (const rol of ['CHEF', 'DELIVERY']) assert.equal((await get(path, rol)).response.status, 403);
    }
  });

  test('cocina recibe solo preparación sin clientes ni información financiera', async () => {
    const mesa = await crearMesa();
    await Pedido.create({
      tipoPedido: 'SALON', mesaId: mesa._id,
      productos: [{ productoId: producto._id, nombreSnapshot: 'Pizza', cantidad: 2, precioUnitario: 1000, subtotal: 2000 }],
      total: 2000, estadoPedido: 'EN_COCINA'
    });
    const r = await get('/api/pedidos/cocina', 'CHEF');
    assert.equal(r.response.status, 200);
    assert.equal(r.body.length, 2);
    assert.equal(r.body.find((p) => p.tipoPedido === 'SALON').mesaId.numero, mesa.numero);
    const json = JSON.stringify(r.body);
    for (const campo of ['total', 'precioUnitario', 'subtotal', 'pagos', 'estadoPago', 'usuarioId', 'CLIENTE-PRIVADO', 'DOMICILIO-PRIVADO', 'TELEFONO-PRIVADO']) {
      assert.equal(json.includes(campo), false, campo);
    }
    assert.equal(r.body[0].productos[0].nombreSnapshot, 'Pizza');
    assert.equal(r.body.find((p) => p._id === pedido.id).productos[0].categoriaSnapshot, 'Pizzas');
  });

  test('los roles acotados no acceden a historiales generales, mesas ni cuentas de caja', async () => {
    for (const rol of ['CHEF', 'DELIVERY']) {
      for (const path of ['/api/pedidos', `/api/pedidos/${pedido._id}`, '/api/mesas', '/api/caja/actual', '/api/usuarios', '/api/auditoria']) {
        assert.equal((await get(path, rol)).response.status, 403, `${rol} ${path}`);
      }
    }
  });

  test('marcar listo no devuelve precios y CHEF no puede completar entregas por la ruta genérica', async () => {
    const r = await requestJson(`/api/pedidos/${pedido._id}/listo`, { method: 'PATCH', headers: authorization(tokens.CHEF) });
    assert.equal(r.response.status, 200);
    assert.equal(r.body.total, undefined);
    assert.equal(r.body.nombreCliente, undefined);
    assert.equal(r.body.productos[0].categoriaSnapshot, 'Pizzas');
    const cambio = await requestJson(`/api/pedidos/${pedido._id}/estado`, {
      method: 'PATCH', headers: authorization(tokens.CHEF), body: JSON.stringify({ estadoPedido: 'EN_CAMINO' })
    });
    assert.equal(cambio.response.status, 403);
    assert.equal((await Pedido.findById(pedido._id)).estadoPedido, 'LISTO');
  });

  test('delivery conserva datos de entrega pero no precios, cobros ni identificación del operador', async () => {
    await Pedido.updateOne({ _id: pedido._id }, { $set: { estadoPedido: 'LISTO' } });
    const r = await get('/api/pedidos/delivery', 'DELIVERY');
    assert.equal(r.response.status, 200);
    assert.equal(r.body[0].direccion, 'DOMICILIO-PRIVADO');
    for (const campo of ['total', 'pagos', 'precioUnitario', 'subtotal', 'usuarioId', 'estadoPago']) {
      assert.equal(JSON.stringify(r.body).includes(campo), false, campo);
    }
    const entregado = await requestJson(`/api/pedidos/delivery/${pedido._id}/entregado`, {
      method: 'PATCH', headers: authorization(tokens.DELIVERY)
    });
    assert.equal(entregado.response.status, 200);
    assert.equal(entregado.body.estadoPedido, 'ENTREGADO');
    assert.equal(entregado.body.total, undefined);
  });
});


