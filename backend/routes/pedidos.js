import express from 'express';
import mongoose from 'mongoose';
import { protect, requirePermission, restrictTo } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';
import { PERMISSIONS } from '../constants/permissions.js';
import Pedido from '../models/Pedido.js';
import Producto from '../models/Producto.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { pedidoOperativo } from '../utils/pedidoOperativo.js';
import {
  ESTADOS_PEDIDO,
  ESTADOS_PAGO,
  TIPOS_PEDIDO,
  isEnumValue
} from '../constants/pedido.js';
import { puedeTransicionarPedido } from '../constants/estadoPedido.js';
import {
  calcularTotalPedido,
  normalizarProductosEdicionPedido,
  validarDatosClientePedido
} from '../utils/pedido.js';
import {
  calcularDescuento,
  pedidoTienePagosRegistrados
} from '../utils/finanzasPedido.js';
import { crearTicketVenta } from '../utils/ticket.js';
import { crearPedidoOperativo, cerrarPedidoOperativo, cancelarPedidoOperativo, eliminarPedidoAbierto } from '../services/operacionesPedidoService.js';
import { cobrarPedido, anularCobroPedido, aplicarDescuentoPedido } from '../services/cobrosService.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';

import { paginacion, cabecerasPagina } from '../utils/paginacion.js';
import { filtroPedidos, resumenDashboard } from '../services/consultaPedidosService.js';

const router = express.Router();
const listarPedidos = async (req, res, filtro, orden = -1, poblar = false, filtros = []) => {
  const pagina = paginacion(req.query, 50, filtros);
  let consulta = Pedido.find(filtro).sort({ fechaPedido: orden, _id: orden }).skip(pagina.skip).limit(pagina.limit);
  if (poblar) consulta = consulta.populate('mesaId', 'numero nombre');
  const [pedidos, total] = await Promise.all([consulta, Pedido.countDocuments(filtro)]);
  cabecerasPagina(res, pagina, total);
  return pedidos.map((p) => pedidoOperativo(p, req.usuario.rol));
};

router.post('/', protect, requirePermission(PERMISSIONS.ORDERS_CREATE), asyncHandler(async (req, res) => {
  const { tipoPedido, nombreCliente, telefono, direccion, comentario, productos, mesaId } = req.body;

  if (!isEnumValue(tipoPedido, TIPOS_PEDIDO)) {
    throw new ApiError(400, 'tipoPedido inválido', {
      field: 'tipoPedido',
      allowedValues: Object.values(TIPOS_PEDIDO)
    });
  }

  validarDatosClientePedido({ tipoPedido, nombreCliente, telefono, direccion, comentario });

  if (!Array.isArray(productos) || productos.length === 0) {
    throw new ApiError(400, 'El pedido debe contener al menos un producto', { field: 'productos' });
  }

  if (tipoPedido === TIPOS_PEDIDO.SALON && !mesaId) {
    throw new ApiError(400, 'Los pedidos de salón requieren una mesa', { field: 'mesaId' });
  }

  if (tipoPedido !== TIPOS_PEDIDO.SALON && mesaId) {
    throw new ApiError(400, 'Solo los pedidos de salón pueden tener una mesa', { field: 'mesaId' });
  }

  if (tipoPedido === TIPOS_PEDIDO.SALON && !mongoose.isValidObjectId(mesaId)) {
    throw new ApiError(400, 'mesaId inválido', { field: 'mesaId' });
  }

  const productoIds = productos.map((item) => item?.productoId);
  if (productoIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new ApiError(400, 'Todos los productos deben tener un productoId válido', {
      field: 'productos.productoId'
    });
  }

  const pedido = await crearPedidoOperativo({ tipoPedido, nombreCliente, telefono, direccion, comentario, productos, mesaId }, req.usuario.id);

  return res.status(201).json(pedido);
}));

router.get('/', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO), asyncHandler(async (req, res) => {
  return res.json(await listarPedidos(req, res, filtroPedidos(req.query), -1, false, ['tipoPedido', 'estadoPedido', 'activos', 'cliente', 'metodoPago', 'desde', 'hasta']));
}));

router.get('/resumen', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO), asyncHandler(async (req, res) => {
  const { resumen, filtro } = await resumenDashboard();
  return res.json({ resumen, pedidos: await listarPedidos(req, res, filtro) });
}));

router.get('/delivery', protect, restrictTo(ROLES.DELIVERY), asyncHandler(async (req, res) => {
  const pedidos = await listarPedidos(req, res, {
    tipoPedido: TIPOS_PEDIDO.DELIVERY,
    estadoPedido: { $in: [ESTADOS_PEDIDO.LISTO, ESTADOS_PEDIDO.EN_CAMINO] },
    'cierre.cerrado': { $ne: true }
  }, 1);

  return res.json(pedidos);
}));

router.patch('/delivery/:id/entregado', protect, restrictTo(ROLES.DELIVERY), asyncHandler(async (req, res) => {
  const pedido = await Pedido.findById(req.params.id);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');

  if (pedido.tipoPedido !== TIPOS_PEDIDO.DELIVERY) {
    throw new ApiError(403, 'El usuario delivery solo puede operar pedidos de delivery');
  }

  if (pedido.cierre?.cerrado) {
    throw new ApiError(409, 'El pedido ya está cerrado');
  }

  if (![ESTADOS_PEDIDO.LISTO, ESTADOS_PEDIDO.EN_CAMINO].includes(pedido.estadoPedido)) {
    throw new ApiError(409, 'El pedido todavía no está disponible para entrega', {
      estadoPedido: pedido.estadoPedido
    });
  }

  const estadoAnterior = pedido.estadoPedido;
  pedido.estadoPedido = ESTADOS_PEDIDO.ENTREGADO;
  await pedido.save();

  await registrarAuditoria({
    accion: ACCIONES_AUDITORIA.PEDIDO_ESTADO_CAMBIADO,
    entidad: ENTIDADES_AUDITORIA.PEDIDO,
    entidadId: pedido._id,
    usuario: req.usuario,
    antes: { estadoPedido: estadoAnterior },
    despues: { estadoPedido: pedido.estadoPedido },
    metadata: { origen: 'DELIVERY' }
  });

  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.get('/cocina', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO, ROLES.CHEF), asyncHandler(async (req, res) => {
  const pedidos = await listarPedidos(req, res, { estadoPedido: ESTADOS_PEDIDO.EN_COCINA }, 1, true);
  return res.json(pedidos);
}));

router.get('/:id/ticket/venta', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO), asyncHandler(async (req, res) => {
  const pedido = await Pedido.findById(req.params.id).populate('mesaId', 'numero nombre');
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');

  if (pedido.estadoPago !== ESTADOS_PAGO.PAGADO) {
    throw new ApiError(409, 'El pedido debe estar pagado para generar el ticket de venta', {
      estadoPago: pedido.estadoPago
    });
  }

  if (pedido.estadoPedido === ESTADOS_PEDIDO.CANCELADO) {
    throw new ApiError(409, 'No se puede generar un ticket de venta para un pedido cancelado');
  }

  return res.json(crearTicketVenta(pedido));
}));

router.patch('/:id/listo', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO, ROLES.CHEF), asyncHandler(async (req, res) => {
  const pedido = await Pedido.findById(req.params.id);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');

  if (pedido.cierre?.cerrado) {
    throw new ApiError(409, 'El pedido ya está cerrado');
  }

  if (pedido.estadoPedido !== ESTADOS_PEDIDO.EN_COCINA) {
    throw new ApiError(409, 'Solo se pueden marcar como listos los pedidos en cocina', {
      estadoPedido: pedido.estadoPedido
    });
  }

  if (!puedeTransicionarPedido(
    pedido.estadoPedido,
    ESTADOS_PEDIDO.LISTO,
    pedido.tipoPedido
  )) {
    throw new ApiError(409, 'Transición de estado de pedido no permitida', {
      from: pedido.estadoPedido,
      to: ESTADOS_PEDIDO.LISTO,
      tipoPedido: pedido.tipoPedido
    });
  }

  const estadoAnterior = pedido.estadoPedido;
  pedido.estadoPedido = ESTADOS_PEDIDO.LISTO;
  await pedido.save();

  await registrarAuditoria({
    accion: ACCIONES_AUDITORIA.PEDIDO_ESTADO_CAMBIADO,
    entidad: ENTIDADES_AUDITORIA.PEDIDO,
    entidadId: pedido._id,
    usuario: req.usuario,
    antes: { estadoPedido: estadoAnterior },
    despues: { estadoPedido: pedido.estadoPedido }
  });

  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.patch('/:id/descuento', protect, requirePermission(PERMISSIONS.CASH_CHARGE), asyncHandler(async (req, res) => {
  const pedido = await aplicarDescuentoPedido(req.params.id, req.body.porcentaje, req.usuario);
  return res.json(pedido);
}));

router.post('/:id/cobrar', protect, requirePermission(PERMISSIONS.CASH_CHARGE), asyncHandler(async (req, res) => {
  const { pedido } = await cobrarPedido(req.params.id, req.body, req.usuario.id, req.usuario);
  return res.json(pedido);
}));

router.post('/:id/anular-cobro', protect, requirePermission(PERMISSIONS.CASH_CHARGE), asyncHandler(async (req, res) => {
  const { pedido } = await anularCobroPedido(req.params.id, req.usuario.id, req.usuario);
  return res.json(pedido);
}));

router.post('/:id/cerrar', protect, requirePermission(PERMISSIONS.CASH_CHARGE), asyncHandler(async (req, res) => {
  const { pedido, modificado } = await cerrarPedidoOperativo(req.params.id, req.usuario.id);
  if (!modificado) return res.json(pedidoOperativo(pedido, req.usuario.rol));

  await registrarAuditoria({
    accion: ACCIONES_AUDITORIA.PEDIDO_CERRADO,
    entidad: ENTIDADES_AUDITORIA.PEDIDO,
    entidadId: pedido._id,
    usuario: req.usuario,
    despues: {
      tipoPedido: pedido.tipoPedido,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      cerrado: true,
      fecha: pedido.cierre?.fecha
    }
  });

  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.get('/:id', protect, restrictTo(ROLES.ADMIN, ROLES.CAJERO), asyncHandler(async (req, res) => {
  const pedido = await Pedido.findById(req.params.id);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');
  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.patch('/:id', protect, requirePermission(PERMISSIONS.ORDERS_EDIT), asyncHandler(async (req, res) => {
  const { productos, nombreCliente, telefono, direccion, comentario } = req.body;

  const pedido = await Pedido.findById(req.params.id);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');

  if (pedido.cierre?.cerrado) {
    throw new ApiError(409, 'No se puede editar un pedido cerrado');
  }

  if (pedido.estadoPedido !== ESTADOS_PEDIDO.ABIERTO) {
    throw new ApiError(409, 'Solo se pueden editar pedidos abiertos', {
      estadoPedido: pedido.estadoPedido
    });
  }

  if (!Array.isArray(productos) || productos.length === 0) {
    throw new ApiError(400, 'El pedido debe contener al menos un producto', {
      field: 'productos'
    });
  }

  const nombreClienteFinal = nombreCliente ?? pedido.nombreCliente;
  const telefonoFinal = telefono ?? pedido.telefono;
  const direccionFinal = direccion ?? pedido.direccion;

  validarDatosClientePedido({
    tipoPedido: pedido.tipoPedido,
    nombreCliente: nombreClienteFinal,
    telefono: telefonoFinal,
    direccion: direccionFinal,
    comentario: comentario ?? pedido.comentario
  });

  const productoIds = productos.map((item) => item?.productoId);
  if (productoIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new ApiError(400, 'Todos los productos deben tener un productoId válido', {
      field: 'productos.productoId'
    });
  }

  const productosDB = await Producto.find({ _id: { $in: productoIds } });
  const productosNormalizados = normalizarProductosEdicionPedido(productos, pedido, productosDB);

  if (pedidoTienePagosRegistrados(pedido)) throw new ApiError(409, 'No se puede editar un pedido con pagos registrados');

  pedido.nombreCliente = nombreClienteFinal;
  pedido.telefono = telefonoFinal;
  pedido.direccion = direccionFinal;
  if (comentario !== undefined) pedido.comentario = comentario;
  pedido.productos = productosNormalizados;
  pedido.total = calcularTotalPedido(productosNormalizados);

  const descuentoActual = calcularDescuento(
    pedido.total,
    pedido.descuento?.porcentaje ?? 0
  );
  pedido.descuento.monto = descuentoActual.monto;
  pedido.totalFinal = descuentoActual.totalFinal;

  await pedido.save();
  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.patch(
  '/:id/estado',
  protect,
  requirePermission(PERMISSIONS.ORDERS_CHANGE_STATUS),
  restrictTo(ROLES.ADMIN, ROLES.CAJERO, ROLES.CHEF),
  asyncHandler(async (req, res) => {
  const { estadoPedido } = req.body;

  if (req.usuario.rol === ROLES.CHEF && estadoPedido !== ESTADOS_PEDIDO.LISTO) {
    throw new ApiError(403, 'Cocina solo puede marcar pedidos como listos');
  }

  if (!isEnumValue(estadoPedido, ESTADOS_PEDIDO)) {
    throw new ApiError(400, 'estadoPedido inválido', {
      field: 'estadoPedido',
      allowedValues: Object.values(ESTADOS_PEDIDO)
    });
  }

  if (estadoPedido === ESTADOS_PEDIDO.CANCELADO) {
    throw new ApiError(403, 'La cancelación requiere el permiso orders:cancel');
  }

  const pedido = await Pedido.findById(req.params.id);
  if (!pedido) throw new ApiError(404, 'Pedido no encontrado');

  if (pedido.cierre?.cerrado) {
    throw new ApiError(409, 'El pedido ya está cerrado');
  }

  if (pedido.estadoPedido === estadoPedido) return res.json(pedidoOperativo(pedido, req.usuario.rol));

  const estadoAnterior = pedido.estadoPedido;

  if (!puedeTransicionarPedido(pedido.estadoPedido, estadoPedido, pedido.tipoPedido)) {
    throw new ApiError(409, 'Transición de estado de pedido no permitida', {
      from: pedido.estadoPedido,
      to: estadoPedido,
      tipoPedido: pedido.tipoPedido
    });
  }

  pedido.estadoPedido = estadoPedido;
  await pedido.save();

  await registrarAuditoria({
    accion: ACCIONES_AUDITORIA.PEDIDO_ESTADO_CAMBIADO,
    entidad: ENTIDADES_AUDITORIA.PEDIDO,
    entidadId: pedido._id,
    usuario: req.usuario,
    antes: { estadoPedido: estadoAnterior },
    despues: { estadoPedido }
  });

  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.patch('/:id/cancelar', protect, requirePermission(PERMISSIONS.ORDERS_CANCEL), asyncHandler(async (req, res) => {
  const { pedido, estadoAnterior } = await cancelarPedidoOperativo(req.params.id);

  await registrarAuditoria({
    accion: ACCIONES_AUDITORIA.PEDIDO_CANCELADO,
    entidad: ENTIDADES_AUDITORIA.PEDIDO,
    entidadId: pedido._id,
    usuario: req.usuario,
    antes: { estadoPedido: estadoAnterior },
    despues: { estadoPedido: pedido.estadoPedido }
  });

  return res.json(pedidoOperativo(pedido, req.usuario.rol));
}));

router.delete('/:id', protect, restrictTo(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await eliminarPedidoAbierto(req.params.id);
  return res.json({ message: 'Pedido eliminado correctamente' });
}));

export default router;


