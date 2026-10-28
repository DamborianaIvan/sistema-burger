import Caja from '../models/Caja.js';
import Ingrediente from '../models/Ingrediente.js';
import MovimientoStock from '../models/MovimientoStock.js';
import Pedido from '../models/Pedido.js';
import Producto from '../models/Producto.js';
import { ESTADOS_REGISTRO_PAGO } from '../constants/caja.js';
import { ESTADOS_PAGO, ESTADOS_PEDIDO, METODOS_PAGO, TIPOS_PEDIDO } from '../constants/pedido.js';
import { TIPOS_MOVIMIENTO_STOCK } from '../constants/stock.js';
import { crearTotalesPorMetodoVacios } from '../constants/caja.js';
import { redondearMoneda } from '../utils/finanzasPedido.js';
import { prorratearImporteNeto } from '../utils/reportes.js';
import { REPORTES } from '../constants/reportes.js';

const ordenarDesc = (campo) => (a, b) => b[campo] - a[campo];

const agregar = (mapa, clave, inicial, fn) => {
  const actual = mapa.get(clave) ?? { ...inicial };
  fn(actual);
  mapa.set(clave, actual);
};

const fechaNegocio = (fecha) => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORTES.ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(fecha));

  const values = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const generarResumenReportes = async ({ inicio, finExclusivo }) => {
  const [pedidos, cajas, movimientosStock, ingredientes] = await Promise.all([
    Pedido.find({
      estadoPago: ESTADOS_PAGO.PAGADO,
      estadoPedido: { $ne: ESTADOS_PEDIDO.CANCELADO },
      'cierre.cerrado': true,
      'cierre.fecha': { $gte: inicio, $lt: finExclusivo }
    }).lean(),
    Caja.find({
      fechaCierre: { $gte: inicio, $lt: finExclusivo }
    }).sort({ fechaCierre: -1 }).lean(),
    MovimientoStock.find({
      fecha: { $gte: inicio, $lt: finExclusivo }
    }).populate('ingredienteId', 'nombre unidad').lean(),
    Ingrediente.find({ activo: true }).sort({ nombre: 1 }).lean()
  ]);

  const productoIdsLegacy = new Set();
  for (const pedido of pedidos) {
    for (const item of pedido.productos ?? []) {
      if (!item.categoriaSnapshot && item.productoId) {
        productoIdsLegacy.add(String(item.productoId));
      }
    }
  }

  const productosLegacy = productoIdsLegacy.size
    ? await Producto.find({ _id: { $in: Array.from(productoIdsLegacy) } })
      .select('_id categoria')
      .lean()
    : [];

  const categoriaPorProducto = new Map(
    productosLegacy.map((producto) => [String(producto._id), producto.categoria])
  );

  const pagosPorMetodo = crearTotalesPorMetodoVacios();
  const ventasPorTipo = Object.fromEntries(
    Object.values(TIPOS_PEDIDO).map((tipo) => [tipo, { cantidad: 0, importe: 0 }])
  );
  const productos = new Map();
  const categorias = new Map();
  const ventasDiarias = new Map();

  let ingresos = 0;
  let totalBruto = 0;
  let descuentos = 0;
  let unidadesVendidas = 0;

  for (const pedido of pedidos) {
    const brutoPedido = Number(pedido.total ?? 0);
    const netoPedido = Number(pedido.totalFinal ?? pedido.total ?? 0);
    ingresos = redondearMoneda(ingresos + netoPedido);
    totalBruto = redondearMoneda(totalBruto + brutoPedido);
    descuentos = redondearMoneda(descuentos + Number(pedido.descuento?.monto ?? Math.max(0, brutoPedido - netoPedido)));

    const dia = fechaNegocio(pedido.cierre?.fecha);
    agregar(ventasDiarias, dia, { fecha: dia, cantidad: 0, ingresos: 0 }, (actual) => {
      actual.cantidad += 1;
      actual.ingresos = redondearMoneda(actual.ingresos + netoPedido);
    });

    if (ventasPorTipo[pedido.tipoPedido]) {
      ventasPorTipo[pedido.tipoPedido].cantidad += 1;
      ventasPorTipo[pedido.tipoPedido].importe = redondearMoneda(
        ventasPorTipo[pedido.tipoPedido].importe + netoPedido
      );
    }

    for (const pago of pedido.pagos ?? []) {
      if ((pago.estado ?? ESTADOS_REGISTRO_PAGO.ACTIVO) !== ESTADOS_REGISTRO_PAGO.ACTIVO) continue;
      if (!Object.values(METODOS_PAGO).includes(pago.metodo)) continue;
      pagosPorMetodo[pago.metodo] = redondearMoneda(
        pagosPorMetodo[pago.metodo] + Number(pago.monto ?? 0)
      );
    }

    const itemsPedido = pedido.productos ?? [];
    let netoAsignado = 0;

    for (const [index, item] of itemsPedido.entries()) {
      const cantidad = Number(item.cantidad ?? 0);
      unidadesVendidas += cantidad;

      const esUltimo = index === itemsPedido.length - 1;
      const importeNeto = esUltimo
        ? redondearMoneda(netoPedido - netoAsignado)
        : prorratearImporteNeto(item.subtotal, brutoPedido, netoPedido);

      netoAsignado = redondearMoneda(netoAsignado + importeNeto);

      const productoKey = item.productoId ? String(item.productoId) : `snapshot:${item.nombreSnapshot}`;
      const categoria = item.categoriaSnapshot
        ?? (item.productoId ? categoriaPorProducto.get(String(item.productoId)) : null)
        ?? 'SIN_CATEGORIA';

      agregar(productos, productoKey, {
        productoId: item.productoId ? String(item.productoId) : null,
        nombre: item.nombreSnapshot,
        cantidad: 0,
        importe: 0
      }, (actual) => {
        actual.cantidad += cantidad;
        actual.importe = redondearMoneda(actual.importe + importeNeto);
      });

      agregar(categorias, categoria, {
        categoria,
        cantidad: 0,
        importe: 0
      }, (actual) => {
        actual.cantidad += cantidad;
        actual.importe = redondearMoneda(actual.importe + importeNeto);
      });
    }
  }

  const cajasResumen = cajas.map((caja) => ({
    id: String(caja._id),
    fechaApertura: caja.fechaApertura,
    fechaCierre: caja.fechaCierre,
    montoInicial: caja.montoInicial,
    totalesPorMetodo: caja.totalesPorMetodo,
    efectivoEsperado: caja.efectivoEsperado,
    efectivoDeclarado: caja.efectivoDeclarado,
    diferencia: caja.diferencia
  }));

  const totalesCaja = crearTotalesPorMetodoVacios();
  let diferenciaCaja = 0;
  for (const caja of cajas) {
    for (const metodo of Object.values(METODOS_PAGO)) {
      totalesCaja[metodo] = redondearMoneda(
        totalesCaja[metodo] + Number(caja.totalesPorMetodo?.[metodo] ?? 0)
      );
    }
    diferenciaCaja = redondearMoneda(diferenciaCaja + Number(caja.diferencia ?? 0));
  }

  const stockPorIngrediente = new Map();
  const tiposStock = Object.values(TIPOS_MOVIMIENTO_STOCK);

  for (const movimiento of movimientosStock) {
    const ingrediente = movimiento.ingredienteId;
    const ingredienteId = typeof ingrediente === 'object' && ingrediente?._id
      ? String(ingrediente._id)
      : String(ingrediente ?? 'desconocido');
    const nombre = typeof ingrediente === 'object' && ingrediente?.nombre
      ? ingrediente.nombre
      : 'Ingrediente eliminado';
    const unidad = typeof ingrediente === 'object' && ingrediente?.unidad
      ? ingrediente.unidad
      : '';

    agregar(stockPorIngrediente, ingredienteId, {
      ingredienteId,
      nombre,
      unidad,
      ENTRADA: 0,
      SALIDA: 0,
      AJUSTE: 0,
      MERMA: 0,
      CONSUMO: 0
    }, (actual) => {
      if (tiposStock.includes(movimiento.tipo)) {
        actual[movimiento.tipo] += Number(movimiento.cantidad ?? 0);
      }
    });
  }

  const alertasStock = ingredientes
    .filter((ingrediente) => Number(ingrediente.stockActual) <= Number(ingrediente.stockMinimo))
    .map((ingrediente) => ({
      ingredienteId: String(ingrediente._id),
      nombre: ingrediente.nombre,
      unidad: ingrediente.unidad,
      stockActual: ingrediente.stockActual,
      stockMinimo: ingrediente.stockMinimo
    }));

  return {
    ventas: {
      cantidad: pedidos.length,
      ingresos,
      totalBruto,
      descuentos,
      ticketPromedio: pedidos.length ? redondearMoneda(ingresos / pedidos.length) : 0,
      unidadesVendidas,
      porTipo: ventasPorTipo,
      porMetodoPago: pagosPorMetodo,
      serieDiaria: Array.from(ventasDiarias.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      productos: Array.from(productos.values()).sort(ordenarDesc('cantidad')),
      categorias: Array.from(categorias.values()).sort(ordenarDesc('importe'))
    },
    caja: {
      cantidadCierres: cajas.length,
      totalesPorMetodo: totalesCaja,
      diferenciaAcumulada: diferenciaCaja,
      sesiones: cajasResumen
    },
    stock: {
      movimientos: movimientosStock.length,
      porIngrediente: Array.from(stockPorIngrediente.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      alertas: alertasStock
    }
  };
};


