import Mesa from '../models/Mesa.js';
import { config } from '../config.js';
import { validarModalidadHabilitada } from '../utils/modalidades.js';
import Pedido from '../models/Pedido.js';
import Producto from '../models/Producto.js';
import { ESTADOS_PAGO, ESTADOS_PEDIDO, TIPOS_PEDIDO } from '../constants/pedido.js';
import { puedeTransicionarPedido } from '../constants/estadoPedido.js';
import { calcularTotalPedido, normalizarProductosPedido } from '../utils/pedido.js';
import { pedidoTienePagosRegistrados } from '../utils/finanzasPedido.js';
import { ApiError } from '../utils/apiError.js';
import { transaccion } from '../utils/transaccion.js';
import { consumirStockPedido } from './stockService.js';

const obtenerPedido = async (id, session) => {
  const pedido = await Pedido.findById(id).session(session);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');
  return pedido;
};

const liberarMesa = async (pedido, session) => {
  if (pedido.tipoPedido !== TIPOS_PEDIDO.SALON || !pedido.mesaId) return;
  const mesa = await Mesa.findById(pedido.mesaId).session(session);
  if (!mesa) throw new ApiError(409, 'No se encontró la mesa asociada al pedido');
  // Contempla datos históricos con más de un pedido activo en la misma mesa.
  const otroActivo = await Pedido.exists({
    _id: { $ne: pedido._id }, mesaId: mesa._id,
    'cierre.cerrado': { $ne: true }, estadoPedido: { $ne: ESTADOS_PEDIDO.CANCELADO }
  }).session(session);
  mesa.estado = otroActivo ? 'OCUPADA' : 'LIBRE';
  await mesa.save({ session });
};

export const crearPedidoOperativo = (datos, usuarioId) => {
  validarModalidadHabilitada(datos.tipoPedido, config.orderTypes);
  return transaccion(async (session) => {
    let mesa = null;
    if (datos.tipoPedido === TIPOS_PEDIDO.SALON) {
      mesa = await Mesa.findById(datos.mesaId).session(session);
      if (!mesa) throw new ApiError(404, 'Mesa no encontrada');
      if (!mesa.activa) throw new ApiError(409, 'La mesa no está activa');
      if (mesa.estado !== 'LIBRE') throw new ApiError(409, 'La mesa ya está ocupada');
      const pedidoActivo = await Pedido.exists({
        mesaId: mesa._id, 'cierre.cerrado': { $ne: true }, estadoPedido: { $ne: ESTADOS_PEDIDO.CANCELADO }
      }).session(session);
      if (pedidoActivo) throw new ApiError(409, 'La mesa ya tiene un pedido activo');
      mesa.estado = 'OCUPADA';
      await mesa.save({ session });
    }
    const productosDB = await Producto.find({ _id: { $in: datos.productos.map((item) => item.productoId) } }).session(session);
    const productos = normalizarProductosPedido(datos.productos, productosDB);
    const total = calcularTotalPedido(productos);
    const [pedido] = await Pedido.create([{
      tipoPedido: datos.tipoPedido, nombreCliente: datos.nombreCliente, telefono: datos.telefono,
      direccion: datos.direccion, comentario: datos.comentario,
      productos, total, totalFinal: total, pagos: [], mesaId: mesa?._id ?? null,
      usuarioId, estadoPedido: ESTADOS_PEDIDO.EN_COCINA, estadoPago: ESTADOS_PAGO.PENDIENTE
    }], { session });
    return pedido;
  });
};

export const cerrarPedidoOperativo = (id, usuarioId) => transaccion(async (session) => {
  const pedido = await obtenerPedido(id, session);
  if (pedido.cierre?.cerrado) return { pedido, modificado: false };
  if (pedido.estadoPago !== ESTADOS_PAGO.PAGADO) {
    throw new ApiError(409, 'El pedido debe estar pagado antes de cerrarse', { estadoPago: pedido.estadoPago });
  }
  const estadoRequerido = pedido.tipoPedido === TIPOS_PEDIDO.SALON ? ESTADOS_PEDIDO.SERVIDO : ESTADOS_PEDIDO.ENTREGADO;
  if (pedido.estadoPedido !== estadoRequerido) {
    throw new ApiError(409, 'El pedido debe completar su flujo operativo antes de cerrarse', {
      estadoPedido: pedido.estadoPedido, estadoRequerido
    });
  }
  pedido.cierre = { cerrado: true, fecha: new Date(), usuarioId };
  await pedido.save({ session });
  await liberarMesa(pedido, session);
  await consumirStockPedido(pedido, usuarioId, session);
  return { pedido, modificado: true };
});

export const cancelarPedidoOperativo = (id) => transaccion(async (session) => {
  const pedido = await obtenerPedido(id, session);
  if (pedido.cierre?.cerrado) throw new ApiError(409, 'No se puede cancelar un pedido cerrado');
  if (pedido.estadoPago === ESTADOS_PAGO.PAGADO && pedido.pagos.length > 0) {
    throw new ApiError(409, 'Debe anular el cobro antes de cancelar el pedido');
  }
  if (!puedeTransicionarPedido(pedido.estadoPedido, ESTADOS_PEDIDO.CANCELADO, pedido.tipoPedido)) {
    throw new ApiError(409, 'El pedido no puede ser cancelado desde su estado actual', {
      estadoPedido: pedido.estadoPedido, tipoPedido: pedido.tipoPedido
    });
  }
  const estadoAnterior = pedido.estadoPedido;
  pedido.estadoPedido = ESTADOS_PEDIDO.CANCELADO;
  await pedido.save({ session });
  await liberarMesa(pedido, session);
  return { pedido, estadoAnterior };
});

export const eliminarPedidoAbierto = (id) => transaccion(async (session) => {
  const pedido = await obtenerPedido(id, session);
  if (pedido.estadoPedido !== ESTADOS_PEDIDO.ABIERTO || pedido.cierre?.cerrado) {
    throw new ApiError(409, 'Solo se puede eliminar de forma destructiva un pedido abierto');
  }
  if (pedidoTienePagosRegistrados(pedido)) throw new ApiError(409, 'No se puede eliminar un pedido con pagos registrados');
  await Pedido.deleteOne({ _id: pedido._id }, { session });
  await liberarMesa(pedido, session);
});

