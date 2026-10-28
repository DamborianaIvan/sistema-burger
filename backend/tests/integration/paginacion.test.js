import test, { before, beforeEach, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import Pedido from '../../models/Pedido.js';
import Caja from '../../models/Caja.js';
import MovimientoCaja from '../../models/MovimientoCaja.js';
import AuditLog from '../../models/AuditLog.js';
import { ComercioPrepizza, PedidoPrepizza } from '../../models/Prepizza.js';
import {
  INTEGRATION_ENABLED, conectarBaseDePrueba, desconectarBaseDePrueba,
  iniciarServidorDePrueba, detenerServidorDePrueba, limpiarPedidos, limpiarUsuarios,
  crearUsuario, crearProducto, loginComo, requestJson, authorization
} from './testSetup.js';

describe('integración: consultas acotadas con totales completos', { skip: !INTEGRATION_ENABLED }, () => {
  let usuario, producto, token;
  before(async () => { await conectarBaseDePrueba(); await iniciarServidorDePrueba(); });
  beforeEach(async () => {
    await limpiarPedidos(); await limpiarUsuarios();
    usuario = await crearUsuario(); producto = await crearProducto();
    token = (await loginComo('admin-test', 'password-admin-123')).token;
  });
  after(async () => { await detenerServidorDePrueba(); await desconectarBaseDePrueba(); });
  const consultar = (path, otroToken = token) => requestJson(path, { headers: authorization(otroToken) });
  const pedidos = (n, extra = {}) => Pedido.create(Array.from({ length: n }, (_, i) => ({
    tipoPedido: 'TAKEAWAY', nombreCliente: `Cliente ${i}`, fechaPedido: new Date(),
    productos: [{ productoId: producto._id, nombreSnapshot: 'Pizza', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
    total: 1000, totalFinal: 1000, ...extra
  })));

  test('rechaza paginación y filtros malformados en lugar de ampliar la consulta', async () => {
    for (const ruta of ['/api/pedidos', '/api/pedidos/cocina', '/api/pedidos/resumen', '/api/prepizzas/resumen', '/api/auditoria']) {
      for (const q of ['limit=0', 'limit=201', 'page=-1', 'page=1.5', 'limit[$gt]=0', 'page=2&page=3', 'page=9999&limit=200']) {
        const { response } = await consultar(`${ruta}?${q}`);
        assert.equal(response.status, 400, `${ruta}?${q}`);
      }
    }
    for (const q of ['estadoPedido[$ne]=CANCELADO', 'tipoPedido=OTRO', 'cliente[$ne]=x', 'metodoPago=x', 'desde=2026-02-30&hasta=2026-03-01', 'activos=true&estadoPedido=CANCELADO']) {
      assert.equal((await consultar(`/api/pedidos?${q}`)).response.status, 400, q);
    }
  });

  test('pagina con orden estable y aplica filtros antes del límite', async () => {
    const fecha = new Date('2026-01-02T15:00:00Z');
    await pedidos(55, { fechaPedido: fecha });
    await pedidos(3, { fechaPedido: fecha, nombreCliente: 'Cliente [literal]', tipoPedido: 'DELIVERY' });
    const primera = await consultar('/api/pedidos?limit=20');
    const segunda = await consultar('/api/pedidos?limit=20&page=2');
    assert.equal(primera.body.length, 20);
    assert.equal(primera.response.headers.get('x-total-count'), '58');
    assert.equal(primera.response.headers.get('x-has-more'), 'true');
    assert.equal(new Set([...primera.body, ...segunda.body].map(p => p._id)).size, 40);
    const literal = await consultar('/api/pedidos?cliente=%5Bliteral%5D&tipoPedido=DELIVERY&limit=1&page=2');
    assert.equal(literal.body.length, 1);
    assert.equal(literal.response.headers.get('x-total-count'), '3');
    assert.equal((await consultar('/api/pedidos')).body.length, 50);
  });

  test('los indicadores no se calculan con la página visible y la caja incluye pendientes antiguos', async () => {
    await pedidos(3, { estadoPedido: 'ENTREGADO', estadoPago: 'PAGADO', cierre: { cerrado: true, fecha: new Date(), usuarioId: usuario._id } });
    await pedidos(2, { estadoPedido: 'EN_COCINA' });
    await pedidos(1, { fechaPedido: new Date('2020-01-02'), nombreCliente: 'Pendiente antiguo' });
    const { body, response } = await consultar('/api/pedidos/resumen?limit=1');
    assert.equal(body.pedidos.length, 1);
    assert.equal(body.resumen.pedidosDia, 3);
    assert.equal(body.resumen.pedidosAbiertos, 2);
    assert.equal(body.resumen.takeawayActivos, 2);
    assert.equal(response.headers.get('x-total-count'), '5');
    const activos = await consultar('/api/pedidos?activos=true');
    assert.equal(activos.body.length, 3);
    assert.ok(activos.body.some(p => p.nombreCliente === 'Pendiente antiguo'));
    assert.equal((await consultar('/api/pedidos?activos=true&estadoPedido=EN_COCINA')).body.length, 2);
  });

  test('cocina y reparto conservan su privacidad en todas las páginas', async () => {
    await pedidos(3, { estadoPedido: 'EN_COCINA', telefono: '1123456789' });
    await pedidos(3, { estadoPedido: 'LISTO', tipoPedido: 'DELIVERY', telefono: '1123456789', direccion: 'Calle 123' });
    await crearUsuario({ nombreUsuario: 'chef', email: 'chef@example.com', rol: 'CHEF' });
    await crearUsuario({ nombreUsuario: 'delivery', email: 'delivery@example.com', rol: 'DELIVERY' });
    const chef = (await loginComo('chef', 'password-admin-123')).token;
    const delivery = (await loginComo('delivery', 'password-admin-123')).token;
    const cocina = await consultar('/api/pedidos/cocina?page=2&limit=1', chef);
    assert.equal(cocina.body.length, 1);
    assert.equal(cocina.body[0].telefono, undefined);
    assert.equal(cocina.body[0].total, undefined);
    assert.equal(cocina.response.headers.get('x-total-count'), '3');
    const reparto = await consultar('/api/pedidos/delivery?page=2&limit=1', delivery);
    assert.equal(reparto.body.length, 1);
    assert.equal(reparto.body[0].direccion, 'Calle 123');
    assert.equal(reparto.body[0].total, undefined);
    assert.equal((await consultar('/api/pedidos/resumen', chef)).response.status, 403);
  });

  test('los saldos incluyen pedidos fuera de página y de los filtros', async () => {
    const comercio = await ComercioPrepizza.create({ nombre: 'Comercio', usuarioId: usuario._id });
    await PedidoPrepizza.create([
      { claveOperacion: 'paginacion-uno', comercioId: comercio._id, comercioNombre: 'Comercio', items: [], total: 100, cobrado: 20, usuarioId: usuario._id },
      { claveOperacion: 'paginacion-dos', comercioId: comercio._id, comercioNombre: 'Comercio', items: [], total: 40, cobrado: 0, estado: 'ENTREGADO', usuarioId: usuario._id },
      { claveOperacion: 'paginacion-tres', comercioId: comercio._id, comercioNombre: 'Comercio', items: [], total: 500, cobrado: 0, estado: 'CANCELADO', usuarioId: usuario._id }
    ]);
    const { body, response } = await consultar('/api/prepizzas/resumen?limit=1&estado=DEUDA');
    assert.equal(body.pedidos.length, 1);
    assert.equal(response.headers.get('x-total-count'), '2');
    assert.equal(body.comercios[0].saldo, 120);
    const filtrado = await consultar(`/api/prepizzas/resumen?limit=1&estado=PENDIENTE&comercioId=${comercio._id}`);
    assert.equal(filtrado.body.comercios[0].saldo, 120);
    assert.equal(filtrado.response.headers.get('x-total-count'), '1');
  });

  test('movimientos de caja y stock también limitan y publican la paginación para el panel', async () => {
    const caja = await Caja.create({ montoInicial: 0, abiertaPor: usuario._id });
    await MovimientoCaja.create(Array.from({ length: 3 }, () => ({ cajaId: caja._id, tipo: 'PAGO', metodo: 'EFECTIVO', monto: 1, usuarioId: usuario._id })));
    const { body, response } = await consultar(`/api/caja/${caja._id}/movimientos?limit=1&page=2`);
    assert.equal(body.length, 1);
    assert.equal(response.headers.get('x-total-count'), '3');
    assert.equal((await consultar('/api/stock/movimientos?limit=201')).response.status, 400);
    const origen = await requestJson('/api/stock/movimientos?limit=1', { headers: { ...authorization(token), Origin: 'http://localhost:5173' } });
    assert.ok(origen.response.headers.get('access-control-expose-headers').includes('X-Total-Count'));
    assert.equal(origen.response.headers.get('x-total-count'), '0');
  });

  test('la auditoría permite consultar eventos anteriores a los primeros 200', async () => {
    await AuditLog.create(Array.from({ length: 205 }, () => ({ accion: 'USUARIO_CREADO', entidad: 'USUARIO', usuarioId: usuario._id })));
    const { body, response } = await consultar('/api/auditoria?limit=200&page=2');
    assert.equal(body.length, 5);
    assert.equal(response.headers.get('x-total-count'), '205');
    assert.equal(response.headers.get('x-has-more'), 'false');
  });
});

