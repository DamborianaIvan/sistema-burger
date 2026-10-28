import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Ingrediente from '../../models/Ingrediente.js';
import MovimientoStock from '../../models/MovimientoStock.js';
import { PedidoPrepizza, VariedadPrepizza } from '../../models/Prepizza.js';

// Perfil de negocio real, independiente del perfil amplio de regresión.
process.env.ORDER_TYPES = 'DELIVERY,TAKEAWAY';
process.env.ENABLE_PREPIZZAS = 'false';
const {
  INTEGRATION_ENABLED, authorization, conectarBaseDePrueba, crearUsuario,
  desconectarBaseDePrueba, detenerServidorDePrueba, iniciarServidorDePrueba,
  limpiarPedidos, limpiarUsuarios, loginComo, requestJson
} = await import('./testSetup.js');

describe('integración: perfil hamburguesería sin circuito mayorista', { skip: !INTEGRATION_ENABLED }, () => {
  const sesiones = {};
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos();
    await limpiarUsuarios();
    for (const rol of ['ADMIN', 'CAJERO', 'CHEF', 'DELIVERY']) {
      await crearUsuario({ nombreUsuario: rol, email: `${rol}@burger.test`, rol });
      sesiones[rol] = await loginComo(rol, 'password-admin-123');
    }
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });

  const api = async (path, rol = 'ADMIN', method = 'GET', datos) => {
    const { response, body } = await requestJson(path, {
      method, headers: authorization(sesiones[rol].token),
      ...(datos ? { body: JSON.stringify(datos) } : {})
    });
    return { status: response.status, body };
  };
  const ok = async (path, rol, method, datos, status = 200) => {
    const r = await api(path, rol, method, datos);
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.body)}`);
    return r.body;
  };

  test('login informa módulos deshabilitados y ninguna solicitud puede reactivar Prepizzas', async () => {
    for (const rol of Object.keys(sesiones)) {
      assert.deepEqual(sesiones[rol].orderTypes, ['DELIVERY', 'TAKEAWAY']);
      assert.deepEqual(sesiones[rol].features, { prepizzas: false });
      assert.equal((await api('/api/prepizzas/resumen', rol)).status, 404);
      assert.equal((await api('/api/prepizzas/variedades', rol, 'POST', {
        nombre: 'No debe crearse', precio: 100, features: { prepizzas: true }
      })).status, 404);
    }
    assert.equal(await VariedadPrepizza.countDocuments(), 0);
  });

  test('delivery y takeaway conservan cocina, cobro, tickets, recetas, cierre único y reportes', async () => {
    const categorias = await ok('/api/categorias-producto', 'ADMIN', 'GET');
    assert.ok(categorias.some(c => c.nombre === 'HAMBURGUESAS'));
    assert.equal(categorias.some(c => ['PIZZAS', 'EMPANADAS'].includes(c.nombre)), false);
    const { producto } = await ok('/api/productos', 'ADMIN', 'POST', {
      nombre: 'Hamburguesa doble de prueba', categoria: 'HAMBURGUESAS', precio: 8500
    }, 201);
    const pan = await ok('/api/stock/ingredientes', 'ADMIN', 'POST', {
      nombre: 'Pan de hamburguesa', unidad: 'UNIDAD', stockInicial: 10
    }, 201);
    const medallon = await ok('/api/stock/ingredientes', 'ADMIN', 'POST', {
      nombre: 'Medallón comprado', unidad: 'UNIDAD', stockInicial: 10
    }, 201);
    await ok(`/api/stock/recetas/${producto._id}`, 'ADMIN', 'PUT', {
      componentes: [{ ingredienteId: pan._id, cantidad: 1 }, { ingredienteId: medallon._id, cantidad: 2 }]
    });
    await ok('/api/caja/abrir', 'CAJERO', 'POST', { montoInicial: 1000 }, 201);

    for (const [tipo, cantidad, metodo] of [['TAKEAWAY', 1, 'EFECTIVO'], ['DELIVERY', 2, 'TRANSFERENCIA']]) {
      const pedido = await ok('/api/pedidos', 'CAJERO', 'POST', {
        tipoPedido: tipo, nombreCliente: 'Cliente sintético', telefono: '2494000000',
        ...(tipo === 'DELIVERY' ? { direccion: 'Dirección de prueba 123' } : {}),
        productos: [{ productoId: producto._id, cantidad, precioUnitario: 1 }], total: 1
      }, 201);
      assert.equal(pedido.total, 8500 * cantidad, 'el precio se calcula en servidor');
      assert.equal(pedido.estadoPedido, 'EN_COCINA');
      const listo = await ok(`/api/pedidos/${pedido._id}/listo`, 'CHEF', 'PATCH');
      assert.equal(listo.total, undefined);
      assert.equal(listo.nombreCliente, undefined);
      if (tipo === 'DELIVERY') {
        const entregado = await ok(`/api/pedidos/delivery/${pedido._id}/entregado`, 'DELIVERY', 'PATCH');
        assert.equal(entregado.estadoPedido, 'ENTREGADO');
        assert.equal(entregado.total, undefined);
      } else {
        assert.equal((await api(`/api/pedidos/delivery/${pedido._id}/entregado`, 'DELIVERY', 'PATCH')).status, 403);
        await ok(`/api/pedidos/${pedido._id}/estado`, 'CAJERO', 'PATCH', { estadoPedido: 'ENTREGADO' });
      }
      assert.equal((await api(`/api/pedidos/${pedido._id}/cerrar`, 'CAJERO', 'POST')).status, 409);
      await ok(`/api/pedidos/${pedido._id}/cobrar`, 'CAJERO', 'POST', { pagos: [{ metodo, monto: 8500 * cantidad }] });
      await ok(`/api/pedidos/${pedido._id}/cerrar`, 'CAJERO', 'POST');
      await ok(`/api/pedidos/${pedido._id}/cerrar`, 'CAJERO', 'POST');
      const ticket = await ok(`/api/pedidos/${pedido._id}/ticket/venta`, 'CAJERO', 'GET');
      assert.equal(ticket.productos[0].nombre, producto.nombre);
      assert.equal(ticket.totalFinal, 8500 * cantidad);
    }
    assert.equal((await Ingrediente.findById(pan._id)).stockActual, 7);
    assert.equal((await Ingrediente.findById(medallon._id)).stockActual, 4);
    assert.equal(await MovimientoStock.countDocuments({ tipo: 'CONSUMO' }), 4);

    // Simula un historial elaborado existente: no se borra ni se mezcla con las ventas.
    await PedidoPrepizza.create({
      claveOperacion: 'historial-conservado', comercioId: producto._id, comercioNombre: 'Comercio histórico',
      items: [{ variedadId: producto._id, nombre: 'Elaborado histórico', cantidad: 1, precioUnitario: 9000, subtotal: 9000 }],
      total: 9000, estado: 'ENTREGADO', fechaEntrega: new Date(), usuarioId: sesiones.ADMIN.id
    });
    const cierre = await ok('/api/caja/cerrar', 'CAJERO', 'POST', { efectivoDeclarado: 9500 });
    assert.equal(cierre.diferencia, 0);
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const reporte = await ok(`/api/reportes/resumen?desde=${hoy}&hasta=${hoy}`, 'CAJERO', 'GET');
    assert.equal(reporte.prepizzas, null);
    assert.equal(reporte.ventas.cantidad, 2);
    assert.equal(reporte.ventas.ingresos, 25500);
    assert.equal(reporte.resumenGeneral.ventas, 25500);
    assert.equal(reporte.resumenGeneral.deudaPrepizzas, 0);
    assert.equal(await PedidoPrepizza.countDocuments(), 1);

    for (const rol of ['CHEF', 'DELIVERY']) {
      for (const ruta of ['/api/pedidos', '/api/caja/actual', '/api/stock/ingredientes', '/api/reportes/resumen', '/api/auditoria']) {
        assert.equal((await api(ruta, rol)).status, 403, `${rol} ${ruta}`);
      }
    }
  });
});
