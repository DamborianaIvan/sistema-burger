import { TIPOS_MOVIMIENTO_MANUAL, TIPOS_MOVIMIENTO_STOCK } from '../constants/stock.js';
import Ingrediente from '../models/Ingrediente.js';
import MovimientoStock from '../models/MovimientoStock.js';
import Receta from '../models/Receta.js';
import { ApiError } from '../utils/apiError.js';
import { calcularConsumosPedido, redondearCantidadStock } from '../utils/stock.js';
import { numero, texto } from '../utils/validaciones.js';
import { transaccion } from '../utils/transaccion.js';

export const registrarMovimientoManual = async (datos, session = null) => {
  if (!session) return transaccion((sesion) => registrarMovimientoManual(datos, sesion));
  const { ingredienteId, tipo, usuarioId } = datos;
  if (!TIPOS_MOVIMIENTO_MANUAL.includes(tipo)) throw new ApiError(400, 'Tipo de movimiento inválido');
  const ingrediente = await Ingrediente.findById(ingredienteId).session(session);
  if (!ingrediente) throw new ApiError(404, 'Ingrediente no encontrado');
  if (!ingrediente.activo) throw new ApiError(409, 'El ingrediente está inactivo');
  const motivo = texto(datos.motivo ?? '', 'motivo', {
    min: [TIPOS_MOVIMIENTO_STOCK.MERMA, TIPOS_MOVIMIENTO_STOCK.AJUSTE].includes(tipo) ? 1 : 0, max: 500
  });
  const stockAnterior = redondearCantidadStock(ingrediente.stockActual ?? 0);
  let stockPosterior;
  let cantidad;
  if (tipo === TIPOS_MOVIMIENTO_STOCK.AJUSTE) {
    stockPosterior = redondearCantidadStock(numero(datos.stockObjetivo, 'stockObjetivo'));
    cantidad = redondearCantidadStock(Math.abs(stockPosterior - stockAnterior));
    if (cantidad === 0) throw new ApiError(409, 'El ajuste no modifica el stock actual');
  } else {
    cantidad = redondearCantidadStock(numero(datos.cantidad, 'cantidad', { min: 0.000001 }));
    stockPosterior = redondearCantidadStock(stockAnterior + (tipo === TIPOS_MOVIMIENTO_STOCK.ENTRADA ? cantidad : -cantidad));
    if (stockPosterior < 0) throw new ApiError(409, 'El movimiento dejaría el stock por debajo de cero');
  }
  ingrediente.stockActual = stockPosterior;
  await ingrediente.save({ session });
  const [movimiento] = await MovimientoStock.create([{
    ingredienteId: ingrediente._id, tipo, cantidad, stockAnterior, stockPosterior, motivo, usuarioId
  }], { session });
  return { movimiento, ingrediente };
};

export const consumirStockPedido = async (pedido, usuarioId, session = null) => {
  if (!session) return transaccion((sesion) => consumirStockPedido(pedido, usuarioId, sesion));
  const yaConsumido = await MovimientoStock.exists({
    pedidoId: pedido._id, tipo: TIPOS_MOVIMIENTO_STOCK.CONSUMO
  }).session(session);
  if (yaConsumido) return { aplicado: false, consumos: [] };
  const productoIds = pedido.productos.map((item) => item.productoId).filter(Boolean);
  if (!productoIds.length) return { aplicado: true, consumos: [] };
  const recetas = await Receta.find({ productoId: { $in: productoIds }, activa: true }).session(session).lean();
  const consumos = calcularConsumosPedido(pedido.productos, recetas);
  for (const consumo of consumos) {
    const ingrediente = await Ingrediente.findById(consumo.ingredienteId).session(session);
    if (!ingrediente) throw new ApiError(409, 'Una receta referencia un ingrediente inexistente');
    const stockAnterior = redondearCantidadStock(ingrediente.stockActual ?? 0);
    const stockPosterior = redondearCantidadStock(stockAnterior - consumo.cantidad);
    if (!Number.isFinite(stockPosterior) || !Number.isFinite(consumo.cantidad) || consumo.cantidad <= 0) {
      throw new ApiError(409, 'Una receta contiene cantidades inválidas');
    }
    // Se conserva la regla existente: el consumo de ventas puede dejar stock negativo.
    ingrediente.stockActual = stockPosterior;
    await ingrediente.save({ session });
    await MovimientoStock.create([{
      ingredienteId: ingrediente._id, tipo: TIPOS_MOVIMIENTO_STOCK.CONSUMO,
      cantidad: consumo.cantidad, stockAnterior, stockPosterior,
      motivo: 'Consumo automático por pedido #' + String(pedido._id).slice(-6),
      pedidoId: pedido._id, usuarioId
    }], { session });
  }
  return { aplicado: true, consumos };
};

