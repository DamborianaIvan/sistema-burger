import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import AuditLog from '../../models/AuditLog.js';
import Ingrediente from '../../models/Ingrediente.js';
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

describe('integración: auditoría y trazabilidad', { skip: !INTEGRATION_ENABLED }, () => {
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
    const adminDb = await crearUsuario();
    const cajeroDb = await crearUsuario({
      nombre: 'Cajero Auditoría',
      nombreUsuario: 'cajero-auditoria',
      email: 'cajero-auditoria@example.com',
      rol: 'CAJERO'
    });

    const [admin, cajero] = await Promise.all([
      loginComo('admin-test', 'password-admin-123'),
      loginComo('cajero-auditoria', 'password-admin-123')
    ]);

    return { adminDb, cajeroDb, admin, cajero };
  };

  test('registra cambios de pedido, caja y stock', async () => {
    const { adminDb, admin } = await prepararUsuarios();

    const producto = await crearProducto({
      nombre: 'Pizza Auditoría',
      precio: 9000
    });

    const pedido = await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Cliente Auditoría',
      telefono: '123456',
      usuarioId: adminDb._id,
      productos: [{
        productoId: producto._id,
        nombreSnapshot: producto.nombre,
        categoriaSnapshot: producto.categoria,
        cantidad: 1,
        precioUnitario: producto.precio,
        subtotal: producto.precio
      }],
      total: producto.precio,
      totalFinal: producto.precio,
      estadoPedido: 'EN_COCINA',
      estadoPago: 'PENDIENTE'
    });

    const listo = await requestJson('/api/pedidos/' + pedido._id + '/listo', {
      method: 'PATCH',
      headers: authorization(admin.token)
    });
    assert.equal(listo.response.status, 200);

    const apertura = await requestJson('/api/caja/abrir', {
      method: 'POST',
      headers: authorization(admin.token),
      body: JSON.stringify({ montoInicial: 5000 })
    });
    assert.equal(apertura.response.status, 201);

    const ingrediente = await Ingrediente.create({
      nombre: 'Harina Auditoría',
      unidad: 'KG',
      stockActual: 10,
      stockMinimo: 2,
      activo: true
    });

    const movimiento = await requestJson(
      '/api/stock/ingredientes/' + ingrediente._id + '/movimientos',
      {
        method: 'POST',
        headers: authorization(admin.token),
        body: JSON.stringify({
          tipo: 'MERMA',
          cantidad: 1,
          motivo: 'Prueba de auditoría'
        })
      }
    );
    assert.equal(movimiento.response.status, 201);

    const acciones = await AuditLog.distinct('accion');

    assert.ok(acciones.includes('PEDIDO_ESTADO_CAMBIADO'));
    assert.ok(acciones.includes('CAJA_ABIERTA'));
    assert.ok(acciones.includes('STOCK_MOVIMIENTO_MANUAL'));

    const stockLog = await AuditLog.findOne({ accion: 'STOCK_MOVIMIENTO_MANUAL' }).lean();
    assert.equal(stockLog.antes.stock, 10);
    assert.equal(stockLog.despues.stock, 9);
    assert.equal(stockLog.metadata.tipo, 'MERMA');
    assert.equal(stockLog.metadata.motivo, 'Prueba de auditoría');
  });

  test('registra cambio de contraseña sin almacenar la contraseña', async () => {
    const { cajeroDb, admin } = await prepararUsuarios();
    const passwordNueva = 'password-super-segura-456';

    const cambio = await requestJson('/api/usuarios/' + cajeroDb._id + '/password', {
      method: 'PATCH',
      headers: authorization(admin.token),
      body: JSON.stringify({ password: passwordNueva })
    });

    assert.equal(cambio.response.status, 200);

    const log = await AuditLog.findOne({
      accion: 'USUARIO_PASSWORD_CAMBIADO',
      entidadId: cajeroDb._id
    }).lean();

    assert.ok(log);
    assert.equal(log.metadata.usuarioAfectado, 'cajero-auditoria');
    assert.equal(JSON.stringify(log).includes(passwordNueva), false);
    assert.equal(JSON.stringify(log).toLowerCase().includes('"password"'), false);
  });

  test('ADMIN consulta auditoría y CAJERO recibe 403', async () => {
    const { admin, cajero } = await prepararUsuarios();

    await AuditLog.create({
      accion: 'CAJA_ABIERTA',
      entidad: 'CAJA',
      usuarioNombreSnapshot: 'Administrador Test'
    });

    const adminResponse = await requestJson('/api/auditoria?entidad=CAJA&limit=50', {
      headers: authorization(admin.token)
    });

    assert.equal(adminResponse.response.status, 200);
    assert.equal(adminResponse.body.length, 1);
    assert.equal(adminResponse.body[0].entidad, 'CAJA');

    const cajeroResponse = await requestJson('/api/auditoria', {
      headers: authorization(cajero.token)
    });

    assert.equal(cajeroResponse.response.status, 403);
  });
});

