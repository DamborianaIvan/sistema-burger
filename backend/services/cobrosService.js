import Pedido from '../models/Pedido.js';
import Caja from '../models/Caja.js';
import MovimientoCaja from '../models/MovimientoCaja.js';
import { ESTADOS_CAJA, ESTADOS_REGISTRO_PAGO, TIPOS_MOVIMIENTO_CAJA } from '../constants/caja.js';
import { ESTADOS_PAGO, ESTADOS_PEDIDO } from '../constants/pedido.js';
import { ApiError } from '../utils/apiError.js';
import { calcularDescuento, marcarPagoAnulado, pagosActivos, pedidoTienePagosRegistrados, redondearMoneda, validarPagosCobro } from '../utils/finanzasPedido.js';
import { transaccion } from '../utils/transaccion.js';
import { registrarAuditoria } from './auditoriaService.js';

const obtenerPedido = async (id, session) => {
  const pedido = await Pedido.findById(id).session(session);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');
  if (pedido.cierre?.cerrado) throw new ApiError(409, 'El pedido ya está cerrado');
  return pedido;
};

// Escribir sobre la caja en la transacción serializa cobros, anulaciones,
// cuotas de prepizzas y el cierre, que también comprueba estado y totales.
const moverCaja = async (pagos, signo, session, cajaId = null) => {
  const incrementos = {};
  const filtro = { estado: ESTADOS_CAJA.ABIERTA };
  if (cajaId) filtro._id = cajaId;
  for (const pago of pagos) {
    const campo = `totalesPorMetodo.${pago.metodo}`;
    incrementos[campo] = redondearMoneda((incrementos[campo] ?? 0) + signo * pago.monto);
  }
  if (signo < 0) {
    for (const [campo, importe] of Object.entries(incrementos)) filtro[campo] = { $gte: -importe };
  }
  const caja = await Caja.findOneAndUpdate(filtro, { $inc: incrementos }, { new: true, session });
  if (!caja) throw new ApiError(409, cajaId
    ? 'El cobro no pertenece a la caja abierta o sus totales recibieron cambios'
    : 'No hay una caja abierta');
  return caja;
};

export const cobrarPedido = (id, datos, usuarioId, actor = { id: usuarioId }) => transaccion(async (session) => {
  const pedido = await obtenerPedido(id, session);
  if (pedido.estadoPedido === ESTADOS_PEDIDO.CANCELADO) throw new ApiError(409, 'No se puede cobrar un pedido cancelado');
  if (pedido.estadoPago === ESTADOS_PAGO.PAGADO || pagosActivos(pedido).length > 0) {
    throw new ApiError(409, 'El pedido ya se encuentra pagado');
  }
  const totalFinal = redondearMoneda(pedido.totalFinal ?? pedido.total);
  const pagos = validarPagosCobro(datos.pagos, totalFinal);
  const caja = await moverCaja(pagos, 1, session);
  const fecha = new Date();
  await MovimientoCaja.create(pagos.map((pago) => ({
    cajaId: caja._id, pedidoId: pedido._id, tipo: TIPOS_MOVIMIENTO_CAJA.PAGO,
    ...pago, usuarioId, fecha
  })), { session, ordered: true });
  pedido.totalFinal = totalFinal;
  pedido.pagos.push(...pagos.map((pago) => ({
    ...pago, usuarioId, cajaId: caja._id, fecha, estado: ESTADOS_REGISTRO_PAGO.ACTIVO
  })));
  pedido.estadoPago = ESTADOS_PAGO.PAGADO;
  await pedido.save({ session });
  await registrarAuditoria({
    accion: 'PEDIDO_COBRADO', entidad: 'PEDIDO', entidadId: pedido._id, usuario: actor,
    despues: { estadoPago: pedido.estadoPago, totalFinal, pagos, cajaId: caja._id }
  }, { session });
  return { pedido, pagos, cajaId: caja._id };
});

export const anularCobroPedido = (id, usuarioId, actor = { id: usuarioId }) => transaccion(async (session) => {
  const pedido = await obtenerPedido(id, session);
  if (pedido.estadoPago !== ESTADOS_PAGO.PAGADO) throw new ApiError(409, 'El pedido no tiene un cobro activo para anular');
  const pagos = pagosActivos(pedido);
  if (!pagos.length) throw new ApiError(409, 'El pedido no tiene pagos activos');
  const cajaId = pagos[0].cajaId;
  if (!cajaId || pagos.some((pago) => String(pago.cajaId) !== String(cajaId))) {
    throw new ApiError(409, 'Los pagos no pertenecen a una misma caja');
  }
  await moverCaja(pagos, -1, session, cajaId);
  const fecha = new Date();
  await MovimientoCaja.create(pagos.map((pago) => ({
    cajaId, pedidoId: pedido._id, tipo: TIPOS_MOVIMIENTO_CAJA.ANULACION_PAGO,
    metodo: pago.metodo, monto: pago.monto, usuarioId, fecha
  })), { session, ordered: true });
  for (const pago of pagos) marcarPagoAnulado(pago, usuarioId, fecha);
  pedido.estadoPago = ESTADOS_PAGO.ANULADO;
  await pedido.save({ session });
  await registrarAuditoria({
    accion: 'PEDIDO_COBRO_ANULADO', entidad: 'PEDIDO', entidadId: pedido._id, usuario: actor,
    despues: { estadoPago: pedido.estadoPago, pagosAnulados: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })), cajaId }
  }, { session });
  return { pedido, pagos, cajaId };
});

export const aplicarDescuentoPedido = (id, porcentaje, actor) => transaccion(async (session) => {
  const pedido = await obtenerPedido(id, session);
  if (pedido.estadoPedido === ESTADOS_PEDIDO.CANCELADO) throw new ApiError(409, 'No se puede aplicar descuento a un pedido cancelado');
  if (pedidoTienePagosRegistrados(pedido)) throw new ApiError(409, 'No se puede modificar el descuento después de registrar un cobro');
  const calculado = calcularDescuento(pedido.total, porcentaje);
  pedido.descuento = { porcentaje: calculado.porcentaje, monto: calculado.monto, aplicadoPor: actor.id, fecha: new Date() };
  pedido.totalFinal = calculado.totalFinal;
  pedido.estadoPago = calculado.totalFinal === 0 ? ESTADOS_PAGO.PAGADO : ESTADOS_PAGO.PENDIENTE;
  await pedido.save({ session });
  await registrarAuditoria({ accion: 'PEDIDO_DESCUENTO_APLICADO', entidad: 'PEDIDO', entidadId: pedido._id, usuario: actor, despues: calculado }, { session });
  return pedido;
});

