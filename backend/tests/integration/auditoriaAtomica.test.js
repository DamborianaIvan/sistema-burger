import test, { before, beforeEach, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import AuditLog from '../../models/AuditLog.js';
import Usuario from '../../models/Usuario.js';
import Pedido from '../../models/Pedido.js';
import Caja from '../../models/Caja.js';
import MovimientoCaja from '../../models/MovimientoCaja.js';
import { PedidoPrepizza, ComercioPrepizza, VariedadPrepizza } from '../../models/Prepizza.js';
import { registrarAuditoria } from '../../services/auditoriaService.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, desconectarBaseDePrueba,
  iniciarServidorDePrueba, detenerServidorDePrueba, limpiarPedidos, limpiarUsuarios,
  crearUsuario, crearProducto, loginComo, requestJson, authorization
} from './testSetup.js';

describe('integración: auditoría obligatoria y atómica', { skip: !INTEGRATION_ENABLED }, () => {
  let admin;
  let pedido;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos(); await limpiarUsuarios(); await crearUsuario();
    admin = await loginComo('admin-test', 'password-admin-123');
    const producto = await crearProducto();
    pedido = await Pedido.create({
      tipoPedido: 'TAKEAWAY', nombreCliente: 'Cliente', productos: [{ productoId: producto._id, nombreSnapshot: 'Pizza', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
      total: 1000, totalFinal: 1000, estadoPedido: 'ENTREGADO'
    });
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const escribir = (path, body = {}, method = 'POST', token = admin.token) => requestJson(path, {
    method, headers: authorization(token), body: JSON.stringify(body)
  });
  const conFallo = async (fn) => {
    const original = AuditLog.create;
    AuditLog.create = async function (...args) {
      await original.apply(this, args);
      throw new Error('Fallo de auditoría después de escribir');
    };
    try { return await fn(); } finally { AuditLog.create = original; }
  };
  const abrir = () => escribir('/api/caja/abrir', { montoInicial: 0 });
  const cobrar = () => escribir(`/api/pedidos/${pedido._id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] });

  test('si falla la auditoría del cobro no se modifican caja, pedido ni movimientos', async () => {
    await abrir();
    assert.equal((await conFallo(cobrar)).response.status, 503);
    assert.equal((await Pedido.findById(pedido._id)).estadoPago, 'PENDIENTE');
    assert.equal((await Caja.findOne()).totalesPorMetodo.EFECTIVO, 0);
    assert.equal(await MovimientoCaja.countDocuments({ pedidoId: pedido._id }), 0);
    assert.equal(await AuditLog.countDocuments({ accion: 'PEDIDO_COBRADO' }), 0);
  });

  test('si falla la auditoría de una anulación se conserva íntegro el cobro', async () => {
    await abrir(); await cobrar();
    const r = await conFallo(() => escribir(`/api/pedidos/${pedido._id}/anular-cobro`));
    assert.equal(r.response.status, 503);
    assert.equal((await Pedido.findById(pedido._id)).estadoPago, 'PAGADO');
    assert.equal((await Caja.findOne()).totalesPorMetodo.EFECTIVO, 1000);
    assert.equal(await MovimientoCaja.countDocuments({ tipo: 'ANULACION_PAGO' }), 0);
  });

  test('apertura, cierre y descuento también revierten si falta su evento', async () => {
    assert.equal((await conFallo(abrir)).response.status, 503);
    assert.equal(await Caja.countDocuments({}), 0);
    await abrir();
    assert.equal((await conFallo(() => escribir('/api/caja/cerrar', { efectivoDeclarado: 0 }))).response.status, 503);
    assert.equal((await Caja.findOne()).estado, 'ABIERTA');
    const r = await conFallo(() => escribir(`/api/pedidos/${pedido._id}/descuento`, { porcentaje: 10 }, 'PATCH'));
    assert.equal(r.response.status, 503);
    assert.equal((await Pedido.findById(pedido._id)).totalFinal, 1000);
  });

  test('un cobro de prepizzas se revierte y un reintento exitoso no duplica la auditoría', async () => {
    await abrir();
    const comercio = await ComercioPrepizza.create({ nombre: 'Comercio' });
    const variedad = await VariedadPrepizza.create({ nombre: 'Clásica', precio: 1000 });
    const p = await PedidoPrepizza.create({ claveOperacion: 'pedido-auditado', comercioId: comercio._id, comercioNombre: comercio.nombre,
      items: [{ variedadId: variedad._id, nombre: variedad.nombre, cantidad: 1, precioUnitario: 1000, subtotal: 1000 }], total: 1000, usuarioId: admin.id });
    const cobro = () => escribir(`/api/prepizzas/pedidos/${p._id}/cobros`, { claveOperacion: 'cuota-auditada', metodo: 'EFECTIVO', monto: 500 });
    assert.equal((await conFallo(cobro)).response.status, 503);
    assert.equal((await PedidoPrepizza.findById(p._id)).cobrado, 0);
    await cobro(); await cobro();
    assert.equal((await Caja.findOne()).totalesPorMetodo.EFECTIVO, 500);
    assert.equal(await AuditLog.countDocuments({ accion: 'PREPIZZA_COBRO_REGISTRADO' }), 1);
  });

  test('cambiar password con auditoría fallida no cambia contraseña ni revoca sesiones', async () => {
    const usuario = await crearUsuario({ nombreUsuario: 'cajero', email: 'cajero@test.com', rol: 'CAJERO' });
    const previo = await loginComo('cajero', 'password-admin-123');
    const r = await conFallo(() => escribir(`/api/usuarios/${usuario._id}/password`, { password: 'password-nueva-123' }, 'PATCH'));
    assert.equal(r.response.status, 503);
    assert.equal((await Usuario.findById(usuario._id)).versionSesion, 0);
    assert.equal((await requestJson('/api/caja/actual', { headers: authorization(previo.token) })).response.status, 200);
    await loginComo('cajero', 'password-admin-123');
  });

  test('el alta de usuarios y los cambios de rol o estado no se confirman sin auditoría', async () => {
    const datos = { nombre: 'Nuevo', nombreUsuario: 'nuevo', email: 'nuevo@test.com', password: 'password-nuevo-123', rol: 'CAJERO' };
    assert.equal((await conFallo(() => escribir('/api/usuarios', datos))).response.status, 503);
    assert.equal(await Usuario.countDocuments({ nombreUsuario: 'nuevo' }), 0);
    const u = await crearUsuario({ nombreUsuario: 'otro', email: 'otro@test.com', rol: 'CAJERO' });
    assert.equal((await conFallo(() => escribir(`/api/usuarios/${u._id}`, { rol: 'CHEF' }, 'PATCH'))).response.status, 503);
    assert.equal((await conFallo(() => escribir(`/api/usuarios/${u._id}/estado`, { activo: false }, 'PATCH'))).response.status, 503);
    const actual = await Usuario.findById(u._id);
    assert.equal(actual.rol, 'CAJERO'); assert.equal(actual.activo, true);
  });

  test('administradores concurrentes no pueden desactivarse mutuamente y dejar el sistema sin acceso', async () => {
    const otro = await crearUsuario({ nombreUsuario: 'otro-admin', email: 'admin2@test.com', rol: 'ADMIN' });
    const login = await loginComo('otro-admin', 'password-admin-123');
    const resultados = await Promise.all([
      escribir(`/api/usuarios/${otro._id}/estado`, { activo: false }, 'PATCH'),
      escribir(`/api/usuarios/${admin.id}/estado`, { activo: false }, 'PATCH', login.token)
    ]);
    assert.equal(resultados.filter((r) => r.response.status === 200).length, 1);
    assert.ok(await Usuario.countDocuments({ rol: 'ADMIN', activo: true }) >= 1);
  });

  test('la auditoría elimina credenciales de estructuras anidadas', async () => {
    const log = await registrarAuditoria({ accion: 'USUARIO_ACTUALIZADO', entidad: 'USUARIO',
      metadata: { texto: 'válido', anidado: [{ password: 'SECRETO', token: 'TOKEN-PRIVADO', dato: 1 }] } });
    assert.equal(JSON.stringify(log).includes('SECRETO'), false);
    assert.equal(JSON.stringify(log).includes('TOKEN-PRIVADO'), false);
    assert.equal(log.metadata.anidado[0].dato, 1);
  });
});

