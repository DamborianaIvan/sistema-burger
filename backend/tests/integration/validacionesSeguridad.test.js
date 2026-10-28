import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Producto from '../../models/Producto.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, crearUsuario, crearProducto,
  desconectarBaseDePrueba, detenerServidorDePrueba, iniciarServidorDePrueba,
  limpiarUsuarios, limpiarPedidos, loginComo, requestJson, authorization
} from './testSetup.js';

describe('integración: validaciones de seguridad', { skip: !INTEGRATION_ENABLED }, () => {
  let token;
  let producto;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos(); await limpiarUsuarios(); await crearUsuario();
    token = (await loginComo('admin-test', 'password-admin-123')).token;
    producto = await crearProducto();
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const escribir = (path, body, method = 'POST') => requestJson(path, {
    method, body: JSON.stringify(body), headers: authorization(token)
  });

  test('crear y editar productos rechaza precios y tipos inválidos sin modificar el producto', async () => {
    for (const precio of [true, null, 'Infinity', '1e308', 0]) {
      assert.equal((await escribir(`/api/productos/${producto._id}`, { precio }, 'PUT')).response.status, 400);
      assert.equal((await escribir('/api/productos', { categoria: 'HAMBURGUESAS', nombre: 'Producto nuevo', precio })).response.status, 400);
    }
    assert.equal((await Producto.findById(producto._id)).precio, 1000);
  });

  test('rechaza cantidades enormes, valores booleanos y textos excesivos al crear pedidos', async () => {
    const datos = {
      tipoPedido: 'TAKEAWAY', nombreCliente: 'Cliente', telefono: '123',
      productos: [{ productoId: String(producto._id), cantidad: 1 }]
    };
    for (const cantidad of [1e308, true, {}, 1000001]) {
      assert.equal((await escribir('/api/pedidos', { ...datos, productos: [{ productoId: String(producto._id), cantidad }] })).response.status, 400);
    }
    assert.equal((await escribir('/api/pedidos', { ...datos, comentario: 'x'.repeat(1001) })).response.status, 400);
  });

  test('rechaza coerciones en arqueos y campos de usuarios', async () => {
    for (const montoInicial of [null, true, '', ' ', 1e308]) {
      assert.equal((await escribir('/api/caja/abrir', { montoInicial })).response.status, 400);
    }
    assert.equal((await escribir('/api/usuarios', {
      nombre: 'Usuario', nombreUsuario: 'usuario', email: 'invalido', password: 'password-123', rol: 'CAJERO'
    })).response.status, 400);
  });
});

