import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import Caja from '../../models/Caja.js';
import Ingrediente from '../../models/Ingrediente.js';
import MovimientoStock from '../../models/MovimientoStock.js';
import Pedido from '../../models/Pedido.js';
import Producto from '../../models/Producto.js';
import {
  INTEGRATION_ENABLED,
  authorization,
  conectarBaseDePrueba,
  crearUsuario,
  desconectarBaseDePrueba,
  detenerServidorDePrueba,
  iniciarServidorDePrueba,
  limpiarPedidos,
  limpiarUsuarios,
  loginComo,
  requestJson
} from './testSetup.js';

describe('integración: reportes', { skip: !INTEGRATION_ENABLED }, () => {
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
    await crearUsuario({
      nombre: 'Cajero Reportes',
      nombreUsuario: 'cajero-reportes',
      email: 'cajero-reportes@example.com',
      rol: 'CAJERO'
    });
    await crearUsuario({
      nombre: 'Chef Reportes',
      nombreUsuario: 'chef-reportes',
      email: 'chef-reportes@example.com',
      rol: 'CHEF'
    });

    const [admin, cajero, chef] = await Promise.all([
      loginComo('admin-test', 'password-admin-123'),
      loginComo('cajero-reportes', 'password-admin-123'),
      loginComo('chef-reportes', 'password-admin-123')
    ]);

    return { adminDb, admin, cajero, chef };
  };

  test('resume ventas, pagos, categorías, caja y stock dentro del período', async () => {
    const { adminDb, admin } = await prepararUsuarios();

    const [pizza, bebida] = await Promise.all([
      Producto.create({
        categoria: 'HAMBURGUESAS',
        nombre: 'Pizza Reporte',
        precio: 8000,
        disponible: true
      }),
      Producto.create({
        categoria: 'BEBIDAS',
        nombre: 'Bebida Reporte',
        precio: 4000,
        disponible: true
      })
    ]);

    const fechaVenta = new Date('2026-09-10T16:00:00.000Z');

    await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Cliente Reporte',
      telefono: '123456',
      usuarioId: adminDb._id,
      productos: [
        {
          productoId: pizza._id,
          nombreSnapshot: pizza.nombre,
          categoriaSnapshot: 'HAMBURGUESAS',
          cantidad: 1,
          precioUnitario: 8000,
          subtotal: 8000
        },
        {
          productoId: bebida._id,
          nombreSnapshot: bebida.nombre,
          categoriaSnapshot: 'BEBIDAS',
          cantidad: 1,
          precioUnitario: 4000,
          subtotal: 4000
        }
      ],
      total: 12000,
      descuento: {
        porcentaje: 16.666667,
        monto: 2000,
        aplicadoPor: adminDb._id,
        fecha: fechaVenta
      },
      totalFinal: 10000,
      pagos: [
        {
          metodo: 'EFECTIVO',
          monto: 6000,
          usuarioId: adminDb._id,
          fecha: fechaVenta,
          estado: 'ACTIVO'
        },
        {
          metodo: 'TRANSFERENCIA',
          monto: 4000,
          usuarioId: adminDb._id,
          fecha: fechaVenta,
          estado: 'ACTIVO'
        }
      ],
      estadoPedido: 'ENTREGADO',
      estadoPago: 'PAGADO',
      cierre: {
        cerrado: true,
        fecha: fechaVenta,
        usuarioId: adminDb._id
      },
      fechaPedido: new Date('2026-09-10T15:00:00.000Z')
    });

    await Pedido.create({
      tipoPedido: 'TAKEAWAY',
      nombreCliente: 'Fuera de rango',
      telefono: '654321',
      usuarioId: adminDb._id,
      productos: [{
        productoId: pizza._id,
        nombreSnapshot: pizza.nombre,
        categoriaSnapshot: 'HAMBURGUESAS',
        cantidad: 1,
        precioUnitario: 8000,
        subtotal: 8000
      }],
      total: 8000,
      totalFinal: 8000,
      estadoPedido: 'ENTREGADO',
      estadoPago: 'PAGADO',
      cierre: {
        cerrado: true,
        fecha: new Date('2026-09-11T04:00:00.000Z'),
        usuarioId: adminDb._id
      }
    });

    await Caja.create({
      estado: 'CERRADA',
      montoInicial: 1000,
      fechaApertura: new Date('2026-09-10T12:00:00.000Z'),
      abiertaPor: adminDb._id,
      fechaCierre: new Date('2026-09-10T22:00:00.000Z'),
      cerradaPor: adminDb._id,
      totalesPorMetodo: {
        EFECTIVO: 6000,
        TRANSFERENCIA: 4000,
        DEBITO: 0,
        CREDITO: 0
      },
      efectivoEsperado: 7000,
      efectivoDeclarado: 6950,
      diferencia: -50
    });

    const ingrediente = await Ingrediente.create({
      nombre: 'Harina Reporte',
      unidad: 'KG',
      stockActual: 1,
      stockMinimo: 2,
      activo: true
    });

    await MovimientoStock.create({
      ingredienteId: ingrediente._id,
      tipo: 'CONSUMO',
      cantidad: 0.5,
      stockAnterior: 1.5,
      stockPosterior: 1,
      motivo: 'Consumo reporte',
      usuarioId: adminDb._id,
      fecha: fechaVenta
    });

    const { response, body } = await requestJson(
      '/api/reportes/resumen?desde=2026-09-10&hasta=2026-09-10',
      { headers: authorization(admin.token) }
    );

    assert.equal(response.status, 200);
    assert.equal(body.periodo.zonaHoraria, 'America/Argentina/Buenos_Aires');
    assert.equal(body.ventas.cantidad, 1);
    assert.equal(body.ventas.ingresos, 10000);
    assert.equal(body.ventas.totalBruto, 12000);
    assert.equal(body.ventas.descuentos, 2000);
    assert.equal(body.ventas.ticketPromedio, 10000);
    assert.equal(body.ventas.unidadesVendidas, 2);
    assert.equal(body.ventas.porMetodoPago.EFECTIVO, 6000);
    assert.equal(body.ventas.porMetodoPago.TRANSFERENCIA, 4000);
    assert.deepEqual(body.ventas.serieDiaria, [{
      fecha: '2026-09-10',
      cantidad: 1,
      ingresos: 10000
    }]);
    assert.equal(body.ventas.productos[0].cantidad, 1);
    assert.equal(
      body.ventas.productos.reduce((sum, item) => sum + item.importe, 0),
      10000
    );
    assert.equal(
      body.ventas.categorias.reduce((sum, item) => sum + item.importe, 0),
      10000
    );

    assert.equal(body.caja.cantidadCierres, 1);
    assert.equal(body.caja.totalesPorMetodo.EFECTIVO, 6000);
    assert.equal(body.caja.diferenciaAcumulada, -50);

    assert.equal(body.stock.movimientos, 1);
    assert.equal(body.stock.porIngrediente[0].CONSUMO, 0.5);
    assert.equal(body.stock.alertas.length, 1);
    assert.equal(body.stock.alertas[0].nombre, 'Harina Reporte');
  });

  test('CAJERO puede ver reportes y CHEF no tiene permiso', async () => {
    const { cajero, chef } = await prepararUsuarios();

    const cajeroResponse = await requestJson(
      '/api/reportes/resumen?desde=2026-09-01&hasta=2026-09-30',
      { headers: authorization(cajero.token) }
    );
    assert.equal(cajeroResponse.response.status, 200);

    const chefResponse = await requestJson(
      '/api/reportes/resumen?desde=2026-09-01&hasta=2026-09-30',
      { headers: authorization(chef.token) }
    );
    assert.equal(chefResponse.response.status, 403);
  });

  test('rechaza fechas inválidas', async () => {
    const { admin } = await prepararUsuarios();

    const { response } = await requestJson(
      '/api/reportes/resumen?desde=2026-09-30&hasta=2026-09-01',
      { headers: authorization(admin.token) }
    );

    assert.equal(response.status, 400);
  });
});

