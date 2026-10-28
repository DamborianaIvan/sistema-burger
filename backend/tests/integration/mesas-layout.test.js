import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Mesa from '../../models/Mesa.js';
import {
  INTEGRATION_ENABLED,
  authorization,
  conectarBaseDePrueba,
  crearMesa,
  crearUsuario,
  desconectarBaseDePrueba,
  detenerServidorDePrueba,
  iniciarServidorDePrueba,
  limpiarPedidos,
  limpiarUsuarios,
  loginComo,
  requestJson
} from './testSetup.js';

describe('integración: plano visual de mesas', { skip: !INTEGRATION_ENABLED }, () => {
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
      nombre: 'Cajero Plano',
      nombreUsuario: 'cajero-plano',
      email: 'cajero-plano@example.com',
      rol: 'CAJERO'
    });

    const [admin, cajero] = await Promise.all([
      loginComo('admin-test', 'password-admin-123'),
      loginComo('cajero-plano', 'password-admin-123')
    ]);

    return { admin, cajero };
  };

  test('ADMIN puede crear una nueva mesa y evita números duplicados', async () => {
    const { admin } = await prepararUsuarios();

    const primera = await requestJson('/api/mesas', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        numero: 10,
        nombre: 'Patio',
        capacidad: 6,
        observaciones: 'Mesa agregada desde el editor'
      })
    });

    assert.equal(primera.response.status, 201);
    assert.equal(primera.body.numero, 10);
    assert.equal(primera.body.nombre, 'Patio');
    assert.equal(primera.body.capacidad, 6);
    assert.equal(primera.body.estado, 'LIBRE');

    const sinNombre = await requestJson('/api/mesas', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        numero: 11,
        capacidad: 4
      })
    });

    assert.equal(sinNombre.response.status, 201);
    assert.equal(sinNombre.body.nombre, 'Mesa 11');

    const duplicada = await requestJson('/api/mesas', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({
        numero: 10,
        capacidad: 4
      })
    });

    assert.equal(duplicada.response.status, 409);
    assert.equal(await Mesa.countDocuments({ numero: 10 }), 1);
  });

  test('ADMIN elimina físicamente una mesa libre sin historial', async () => {
    const { admin } = await prepararUsuarios();
    const mesa = await crearMesa({ numero: 20 });

    const eliminado = await requestJson('/api/mesas/' + mesa._id, {
      method: 'DELETE',
      headers: authorization(admin.token)
    });

    assert.equal(eliminado.response.status, 200);
    assert.equal(eliminado.body.modo, 'ELIMINADA');
    assert.equal(await Mesa.countDocuments({ _id: mesa._id }), 0);
  });

  test('ADMIN archiva una mesa con historial y la oculta del salón', async () => {
    const { admin } = await prepararUsuarios();
    const mesa = await crearMesa({ numero: 21 });
    const producto = await (await import('../../models/Producto.js')).default.create({
      categoria: 'HAMBURGUESAS',
      nombre: 'Pizza Historial Mesa',
      precio: 1000,
      disponible: true
    });
    const Pedido = (await import('../../models/Pedido.js')).default;

    await Pedido.create({
      tipoPedido: 'SALON',
      mesaId: mesa._id,
      usuarioId: admin.id,
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        cantidad: 1,
        precioUnitario: 1000,
        subtotal: 1000
      }],
      total: 1000,
      totalFinal: 1000,
      estadoPedido: 'SERVIDO',
      estadoPago: 'PAGADO',
      cierre: {
        cerrado: true,
        fecha: new Date(),
        usuarioId: admin.id
      }
    });

    const eliminado = await requestJson('/api/mesas/' + mesa._id, {
      method: 'DELETE',
      headers: authorization(admin.token)
    });

    assert.equal(eliminado.response.status, 200);
    assert.equal(eliminado.body.modo, 'ARCHIVADA');

    const guardada = await Mesa.findById(mesa._id).lean();
    assert.equal(guardada.activa, false);

    const listado = await requestJson('/api/mesas', {
      headers: authorization(admin.token)
    });
    assert.equal(listado.response.status, 200);
    assert.equal(listado.body.some((item) => item._id === mesa._id.toString()), false);
  });

  test('rechaza eliminar una mesa ocupada', async () => {
    const { admin } = await prepararUsuarios();
    const mesa = await crearMesa({ numero: 22, estado: 'OCUPADA' });

    const eliminado = await requestJson('/api/mesas/' + mesa._id, {
      method: 'DELETE',
      headers: authorization(admin.token)
    });

    assert.equal(eliminado.response.status, 409);
    assert.equal(await Mesa.countDocuments({ _id: mesa._id }), 1);
  });

  test('ADMIN persiste posición, tamaño, rotación y forma del plano', async () => {
    const { admin } = await prepararUsuarios();
    const mesa1 = await crearMesa({ numero: 1 });
    const mesa2 = await crearMesa({ numero: 2 });

    const { response, body } = await requestJson('/api/mesas/layout', {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({
        mesas: [
          {
            id: mesa1._id.toString(),
            layout: {
              x: 100,
              y: 120,
              ancho: 160,
              alto: 100,
              rotacion: 45,
              forma: 'RECTANGULAR'
            }
          },
          {
            id: mesa2._id.toString(),
            layout: {
              x: 500,
              y: 250,
              ancho: 120,
              alto: 120,
              rotacion: 0,
              forma: 'REDONDA'
            }
          }
        ]
      })
    });

    assert.equal(response.status, 200);
    assert.equal(body.mesas.length, 2);

    const [guardada1, guardada2] = await Promise.all([
      Mesa.findById(mesa1._id).lean(),
      Mesa.findById(mesa2._id).lean()
    ]);

    assert.deepEqual(guardada1.layout, {
      x: 100,
      y: 120,
      ancho: 160,
      alto: 100,
      rotacion: 45,
      forma: 'RECTANGULAR'
    });
    assert.deepEqual(guardada2.layout, {
      x: 500,
      y: 250,
      ancho: 120,
      alto: 120,
      rotacion: 0,
      forma: 'REDONDA'
    });
  });

  test('CAJERO puede ver mesas pero no modificar el layout', async () => {
    const { cajero } = await prepararUsuarios();
    const mesa = await crearMesa({ numero: 3 });

    const lectura = await requestJson('/api/mesas', {
      headers: authorization(cajero.token)
    });
    assert.equal(lectura.response.status, 200);

    const cambio = await requestJson('/api/mesas/layout', {
      method: 'PATCH',
      headers: authorization(cajero.token),
      body: JSON.stringify({
        mesas: [{
          id: mesa._id.toString(),
          layout: {
            x: 10,
            y: 10,
            ancho: 120,
            alto: 100,
            rotacion: 0,
            forma: 'RECTANGULAR'
          }
        }]
      })
    });

    assert.equal(cambio.response.status, 403);
  });

  test('rechaza mesas fuera del plano y no aplica cambios parciales', async () => {
    const { admin } = await prepararUsuarios();
    const mesa1 = await crearMesa({ numero: 4 });
    const mesa2 = await crearMesa({ numero: 5 });

    const { response } = await requestJson('/api/mesas/layout', {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({
        mesas: [
          {
            id: mesa1._id.toString(),
            layout: {
              x: 50,
              y: 50,
              ancho: 120,
              alto: 100,
              rotacion: 0,
              forma: 'RECTANGULAR'
            }
          },
          {
            id: mesa2._id.toString(),
            layout: {
              x: 1150,
              y: 650,
              ancho: 120,
              alto: 100,
              rotacion: 0,
              forma: 'RECTANGULAR'
            }
          }
        ]
      })
    });

    assert.equal(response.status, 400);

    const guardada1 = await Mesa.findById(mesa1._id).lean();
    assert.equal(guardada1.layout.x, 0);
    assert.equal(guardada1.layout.y, 0);
  });
});

