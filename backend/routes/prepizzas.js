import express from "express";
import mongoose from "mongoose";
import { paginacion, cabecerasPagina } from "../utils/paginacion.js";
import { protect, requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  VariedadPrepizza,
  ComercioPrepizza,
  PedidoPrepizza,
  MovimientoPrepizza,
} from "../models/Prepizza.js";
import {
  buscarPrepizza,
  validarComponentes,
  moverStockPrepizza,
  crearPedidoPrepizza,
  entregarPedidoPrepizza,
  cobrarPedidoPrepizza,
  cancelarPedidoPrepizza,
} from "../services/prepizzasService.js";
import {
  numeroPrepizza,
  textoPrepizza,
  serializarPedidoPrepizza,
  seguimientoPendiente,
  proximoContacto,
} from "../utils/prepizzas.js";
import { ApiError } from "../utils/apiError.js";
import { registrarAuditoria } from "../services/auditoriaService.js";

const router = express.Router();
router.use(protect, requirePermission(PERMISSIONS.PREPIZZAS_OPERATE));
const administrar = requirePermission(PERMISSIONS.STOCK_ADJUST);
const auditar = (req, accion, doc, metadata = null) =>
  registrarAuditoria({
    accion,
    entidad: "PREPIZZA",
    entidadId: doc._id,
    usuario: req.usuario,
    metadata,
  });
const booleano = (valor) => {
  if (typeof valor !== "boolean") throw new ApiError(400, "Estado inválido");
  return valor;
};

router.get(
  "/resumen",
  asyncHandler(async (req, res) => {
    const pagina = paginacion(req.query, 50, ["estado", "comercioId"]);
    const filtro = {};
    if (req.query.comercioId !== undefined) {
      if (typeof req.query.comercioId !== 'string' || !mongoose.isValidObjectId(req.query.comercioId)) throw new ApiError(400, 'Comercio inválido');
      filtro.comercioId = req.query.comercioId;
    }
    if (req.query.estado !== undefined) {
      if (!['PENDIENTE', 'ENTREGADO', 'CANCELADO', 'DEUDA'].includes(req.query.estado)) throw new ApiError(400, 'Estado inválido');
      if (req.query.estado === 'DEUDA') {
        filtro.estado = { $ne: 'CANCELADO' };
        filtro.$expr = { $gt: ['$total', '$cobrado'] };
      } else filtro.estado = req.query.estado;
    }
    const [variedades, comercios, pedidos, movimientos, total, deudas] = await Promise.all([
      VariedadPrepizza.find().sort({ nombre: 1 }).lean(),
      ComercioPrepizza.find().sort({ nombre: 1 }).lean(),
      PedidoPrepizza.find(filtro).sort({ createdAt: -1, _id: -1 }).skip(pagina.skip).limit(pagina.limit).lean(),
      MovimientoPrepizza.find()
        .populate("usuarioId", "nombre")
        .sort({ fecha: -1, _id: -1 })
        .limit(200)
        .lean(),
      PedidoPrepizza.countDocuments(filtro),
      PedidoPrepizza.aggregate([
        { $match: { estado: { $ne: 'CANCELADO' } } },
        { $group: { _id: '$comercioId', centavos: { $sum: { $round: [{ $multiply: [{ $subtract: ['$total', '$cobrado'] }, 100] }, 0] } } } }
      ])
    ]);
    const saldos = new Map(deudas.map((d) => [String(d._id), d.centavos]));
    cabecerasPagina(res, pagina, total);
    return res.json({
      variedades,
      comercios: comercios.map((c) => ({
        ...c,
        saldo: (saldos.get(String(c._id)) ?? 0) / 100,
        requiereContacto: seguimientoPendiente(c),
      })),
      pedidos: pedidos.map(serializarPedidoPrepizza),
      movimientos,
    });
  }),
);
router.post(
  "/variedades",
  administrar,
  asyncHandler(async (req, res) => {
    const variedad = await VariedadPrepizza.create({
      nombre: textoPrepizza(req.body.nombre, 80, true),
      precio: Math.round(numeroPrepizza(req.body.precio) * 100) / 100,
      componentes: await validarComponentes(req.body.componentes ?? []),
    });
    await auditar(req, "PREPIZZA_VARIEDAD_GUARDADA", variedad, {
      nombre: variedad.nombre,
    });
    res.status(201).json(variedad);
  }),
);
router.patch(
  "/variedades/:id",
  administrar,
  asyncHandler(async (req, res) => {
    const variedad = await buscarPrepizza(VariedadPrepizza, req.params.id);
    if (req.body.nombre !== undefined)
      variedad.nombre = textoPrepizza(req.body.nombre, 80, true);
    if (req.body.precio !== undefined)
      variedad.precio = Math.round(numeroPrepizza(req.body.precio) * 100) / 100;
    if (req.body.activa !== undefined)
      variedad.activa = booleano(req.body.activa);
    if (req.body.componentes !== undefined)
      variedad.componentes = await validarComponentes(req.body.componentes);
    await variedad.save();
    await auditar(req, "PREPIZZA_VARIEDAD_GUARDADA", variedad, {
      nombre: variedad.nombre,
      activa: variedad.activa,
    });
    res.json(variedad);
  }),
);
router.post(
  "/movimientos",
  administrar,
  asyncHandler(async (req, res) => {
    const movimiento = await moverStockPrepizza(req.body, req.usuario.id);
    await auditar(req, "PREPIZZA_STOCK_REGISTRADO", movimiento, {
      variedad: movimiento.nombre,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      motivo: movimiento.motivo,
    });
    res.status(201).json(movimiento);
  }),
);
router.post(
  "/comercios",
  asyncHandler(async (req, res) => {
    const comercio = await ComercioPrepizza.create({
      nombre: textoPrepizza(req.body.nombre, 100, true),
      direccion: textoPrepizza(req.body.direccion ?? "", 200),
      telefono: textoPrepizza(req.body.telefono ?? "", 60),
      diasSeguimiento: numeroPrepizza(req.body.diasSeguimiento ?? 5, {
        entero: true,
        minimo: 1,
        maximo: 365,
      }),
    });
    await auditar(req, "PREPIZZA_COMERCIO_GUARDADO", comercio, {
      nombre: comercio.nombre,
    });
    res.status(201).json(comercio);
  }),
);
router.patch(
  "/comercios/:id",
  asyncHandler(async (req, res) => {
    const comercio = await buscarPrepizza(ComercioPrepizza, req.params.id);
    for (const [field, max] of [
      ["nombre", 100],
      ["direccion", 200],
      ["telefono", 60],
    ])
      if (req.body[field] !== undefined)
        comercio[field] = textoPrepizza(
          req.body[field],
          max,
          field === "nombre",
        );
    if (req.body.activo !== undefined)
      comercio.activo = booleano(req.body.activo);
    if (req.body.diasSeguimiento !== undefined) {
      comercio.diasSeguimiento = numeroPrepizza(req.body.diasSeguimiento, {
        entero: true,
        minimo: 1,
        maximo: 365,
      });
      const ultimoContacto = comercio.contactos.at(-1)?.fecha;
      const base =
        ultimoContacto &&
        (!comercio.ultimaEntrega || ultimoContacto > comercio.ultimaEntrega)
          ? ultimoContacto
          : comercio.ultimaEntrega;
      if (base)
        comercio.proximoSeguimiento = proximoContacto(
          base,
          comercio.diasSeguimiento,
        );
    }
    await comercio.save();
    await auditar(req, "PREPIZZA_COMERCIO_GUARDADO", comercio, {
      nombre: comercio.nombre,
      activo: comercio.activo,
    });
    res.json(comercio);
  }),
);
router.post(
  "/comercios/:id/contactos",
  asyncHandler(async (req, res) => {
    const comercio = await buscarPrepizza(ComercioPrepizza, req.params.id);
    if (!comercio.activo) throw new ApiError(409, "El comercio está inactivo");
    const fecha = new Date();
    const dias = numeroPrepizza(
      req.body.diasHastaContacto ?? comercio.diasSeguimiento,
      { entero: true, minimo: 1, maximo: 365 },
    );
    comercio.contactos.push({
      fecha,
      nota: textoPrepizza(req.body.nota ?? ""),
      usuarioId: req.usuario.id,
    });
    comercio.proximoSeguimiento = proximoContacto(fecha, dias);
    await comercio.save();
    await auditar(req, "PREPIZZA_CONTACTO_REGISTRADO", comercio, {
      comercio: comercio.nombre,
      nota: req.body.nota,
      proximoSeguimiento: comercio.proximoSeguimiento,
    });
    res.status(201).json(comercio);
  }),
);
router.post(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const pedido = await crearPedidoPrepizza(req.body, req.usuario.id);
    await auditar(req, "PREPIZZA_PEDIDO_CREADO", pedido, {
      comercio: pedido.comercioNombre,
      total: pedido.total,
    });
    res.status(201).json(serializarPedidoPrepizza(pedido));
  }),
);
router.post(
  "/pedidos/:id/entregar",
  asyncHandler(async (req, res) => {
    const pedido = await entregarPedidoPrepizza(req.params.id, req.usuario.id);
    await auditar(req, "PREPIZZA_PEDIDO_ENTREGADO", pedido, {
      comercio: pedido.comercioNombre,
      total: pedido.total,
    });
    res.json(serializarPedidoPrepizza(pedido));
  }),
);
router.post(
  "/pedidos/:id/cobros",
  requirePermission(PERMISSIONS.CASH_CHARGE),
  asyncHandler(async (req, res) => {
    const pedido = await cobrarPedidoPrepizza(
      req.params.id,
      req.body,
      req.usuario.id,
      req.usuario,
    );
    res.json(serializarPedidoPrepizza(pedido));
  }),
);
router.post(
  "/pedidos/:id/cancelar",
  asyncHandler(async (req, res) => {
    const pedido = await cancelarPedidoPrepizza(
      req.params.id,
      req.body.motivo,
      req.usuario.id,
    );
    await auditar(req, "PREPIZZA_PEDIDO_CANCELADO", pedido, {
      comercio: pedido.comercioNombre,
      motivo: pedido.motivoCancelacion,
    });
    res.json(serializarPedidoPrepizza(pedido));
  }),
);
export default router;


