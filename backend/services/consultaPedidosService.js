import Pedido from '../models/Pedido.js';
import { TIPOS_PEDIDO, ESTADOS_PEDIDO, METODOS_PAGO } from '../constants/pedido.js';
import { REPORTES } from '../constants/reportes.js';
import { resolverRangoReportes } from '../utils/reportes.js';
import { ApiError } from '../utils/apiError.js';
import { texto } from '../utils/validaciones.js';
import { escaparRegex } from '../utils/producto.js';

export const filtroPedidos = (q) => {
  const filtro = {};
  for (const [campo, valores] of [['tipoPedido', TIPOS_PEDIDO], ['estadoPedido', ESTADOS_PEDIDO]]) {
    if (q[campo] !== undefined) {
      if (!Object.values(valores).includes(q[campo])) throw new ApiError(400, `${campo} inválido`);
      filtro[campo] = q[campo];
    }
  }
  if (q.activos !== undefined) {
    if (!['true', 'false'].includes(q.activos)) throw new ApiError(400, 'activos inválido');
    if (q.activos === 'true') {
      filtro['cierre.cerrado'] = { $ne: true };
      if (filtro.estadoPedido === ESTADOS_PEDIDO.CANCELADO) throw new ApiError(400, 'Un pedido cancelado no puede estar activo');
      filtro.estadoPedido ??= { $ne: ESTADOS_PEDIDO.CANCELADO };
    }
  }
  if (q.cliente !== undefined) filtro.nombreCliente = { $regex: escaparRegex(texto(q.cliente, 'cliente', { max: 100 })), $options: 'i' };
  if (q.metodoPago !== undefined) {
    if (!Object.values(METODOS_PAGO).includes(q.metodoPago)) throw new ApiError(400, 'Método de pago inválido');
    filtro.pagos = { $elemMatch: { metodo: q.metodoPago, estado: { $ne: 'ANULADO' } } };
  }
  if (q.desde !== undefined || q.hasta !== undefined) {
    const rango = resolverRangoReportes(q.desde, q.hasta);
    filtro.fechaPedido = { $gte: rango.inicio, $lt: rango.finExclusivo };
  }
  return filtro;
};

export const resumenDashboard = async () => {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: REPORTES.ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((i) => [i.type, i.value]));
  const hoy = `${p.year}-${p.month}-${p.day}`;
  const dia = resolverRangoReportes(hoy, hoy);
  const mes = resolverRangoReportes(`${p.year}-${p.month}-01`, hoy);
  const [conteos] = await Pedido.aggregate([
    { $match: { fechaPedido: { $gte: mes.inicio, $lt: dia.finExclusivo } } },
    { $group: {
      _id: null,
      totalMes: { $sum: { $cond: [{ $and: ['$cierre.cerrado', { $eq: ['$estadoPago', 'PAGADO'] }, { $ne: ['$estadoPedido', 'CANCELADO'] }] }, 1, 0] } },
      pedidosDia: { $sum: { $cond: [{ $and: [{ $gte: ['$fechaPedido', dia.inicio] }, '$cierre.cerrado', { $eq: ['$estadoPago', 'PAGADO'] }, { $ne: ['$estadoPedido', 'CANCELADO'] }] }, 1, 0] } },
      pedidosAbiertos: { $sum: { $cond: [{ $and: [{ $gte: ['$fechaPedido', dia.inicio] }, { $in: ['$estadoPedido', ['ABIERTO', 'CONFIRMADO', 'EN_COCINA', 'LISTO', 'EN_CAMINO']] }] }, 1, 0] } },
      ...Object.fromEntries(['SALON', 'DELIVERY', 'TAKEAWAY'].map((tipo) => [tipo.toLowerCase() + 'Activos', { $sum: { $cond: [{ $and: [{ $gte: ['$fechaPedido', dia.inicio] }, { $eq: ['$tipoPedido', tipo] }, { $ne: ['$cierre.cerrado', true] }, { $ne: ['$estadoPedido', 'CANCELADO'] }] }, 1, 0] } }]))
    } }
  ]);
  const resumen = { totalMes: 0, pedidosDia: 0, pedidosAbiertos: 0, salonActivos: 0, deliveryActivos: 0, takeawayActivos: 0, ...conteos };
  delete resumen._id;
  return { resumen, filtro: { fechaPedido: { $gte: dia.inicio, $lt: dia.finExclusivo } } };
};

