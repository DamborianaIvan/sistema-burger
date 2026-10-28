import { paginacion, cabecerasPagina } from '../utils/paginacion.js';
import express from 'express';
import mongoose from 'mongoose';
import { PERMISSIONS } from '../constants/permissions.js';
import {
  TIPOS_MOVIMIENTO_MANUAL,
  TIPOS_MOVIMIENTO_STOCK,
  UNIDADES_INGREDIENTE
} from '../constants/stock.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import Ingrediente from '../models/Ingrediente.js';
import MovimientoStock from '../models/MovimientoStock.js';
import Producto from '../models/Producto.js';
import Receta from '../models/Receta.js';
import { registrarMovimientoManual } from '../services/stockService.js';
import { ApiError } from '../utils/apiError.js';
import { transaccion } from '../utils/transaccion.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';

const router = express.Router();

router.use(protect, requirePermission(PERMISSIONS.STOCK_ADJUST));

const validarObjectId = (valor, field = 'id') => {
  if (!mongoose.isValidObjectId(valor)) {
    throw new ApiError(400, field + ' inválido', { field });
  }
};

const escaparRegex = (valor) => valor.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

const obtenerIngrediente = async (id) => {
  validarObjectId(id);
  const ingrediente = await Ingrediente.findById(id);
  if (!ingrediente) throw new ApiError(404, 'Ingrediente no encontrado');
  return ingrediente;
};

router.get('/ingredientes', asyncHandler(async (req, res) => {
  const ingredientes = await Ingrediente.find().sort({ activo: -1, nombre: 1 }).lean();
  return res.json(ingredientes.map((ingrediente) => ({
    ...ingrediente,
    stockBajo: ingrediente.activo && ingrediente.stockActual <= ingrediente.stockMinimo
  })));
}));

router.post('/ingredientes', asyncHandler(async (req, res) => {
  const { nombre, unidad, stockMinimo = 0, stockInicial = 0 } = req.body;
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';

  if (nombreLimpio.length < 2 || nombreLimpio.length > 80) {
    throw new ApiError(400, 'El nombre del ingrediente debe tener entre 2 y 80 caracteres', {
      field: 'nombre'
    });
  }

  if (!Object.values(UNIDADES_INGREDIENTE).includes(unidad)) {
    throw new ApiError(400, 'Unidad de ingrediente inválida', {
      field: 'unidad',
      allowedValues: Object.values(UNIDADES_INGREDIENTE)
    });
  }

  const minimo = Number(stockMinimo);
  if (!Number.isFinite(minimo) || minimo < 0) {
    throw new ApiError(400, 'stockMinimo debe ser mayor o igual a cero', {
      field: 'stockMinimo'
    });
  }

  const inicial = Number(stockInicial);
  if (!Number.isFinite(inicial) || inicial < 0) {
    throw new ApiError(400, 'stockInicial debe ser mayor o igual a cero', {
      field: 'stockInicial'
    });
  }

  const existente = await Ingrediente.findOne({
    nombre: { $regex: new RegExp('^' + escaparRegex(nombreLimpio) + '$', 'i') }
  });
  if (existente) throw new ApiError(409, 'Ya existe un ingrediente con ese nombre');

  const ingrediente = await transaccion(async (session) => {
    const [nuevo] = await Ingrediente.create([{
      nombre: nombreLimpio, unidad, stockActual: 0, stockMinimo: minimo, activo: true
    }], { session });
    if (inicial === 0) return nuevo;
    const resultado = await registrarMovimientoManual({
      ingredienteId: nuevo._id, tipo: TIPOS_MOVIMIENTO_STOCK.ENTRADA,
      cantidad: inicial, motivo: 'Stock inicial', usuarioId: req.usuario.id
    }, session);
    return resultado.ingrediente;
  });

  return res.status(201).json(ingrediente);
}));

router.patch('/ingredientes/:id', asyncHandler(async (req, res) => {
  const ingrediente = await obtenerIngrediente(req.params.id);
  const { nombre, unidad, stockMinimo } = req.body;

  if (nombre !== undefined) {
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (nombreLimpio.length < 2 || nombreLimpio.length > 80) {
      throw new ApiError(400, 'El nombre del ingrediente debe tener entre 2 y 80 caracteres', {
        field: 'nombre'
      });
    }

    const repetido = await Ingrediente.findOne({
      _id: { $ne: ingrediente._id },
      nombre: { $regex: new RegExp('^' + escaparRegex(nombreLimpio) + '$', 'i') }
    });
    if (repetido) throw new ApiError(409, 'Ya existe un ingrediente con ese nombre');
    ingrediente.nombre = nombreLimpio;
  }

  if (unidad !== undefined && unidad !== ingrediente.unidad) {
    if (!Object.values(UNIDADES_INGREDIENTE).includes(unidad)) {
      throw new ApiError(400, 'Unidad de ingrediente inválida', { field: 'unidad' });
    }

    const tieneMovimientos = await MovimientoStock.exists({ ingredienteId: ingrediente._id });
    if (tieneMovimientos) {
      throw new ApiError(409, 'No se puede cambiar la unidad de un ingrediente con movimientos');
    }
    ingrediente.unidad = unidad;
  }

  if (stockMinimo !== undefined) {
    const minimo = Number(stockMinimo);
    if (!Number.isFinite(minimo) || minimo < 0) {
      throw new ApiError(400, 'stockMinimo debe ser mayor o igual a cero', {
        field: 'stockMinimo'
      });
    }
    ingrediente.stockMinimo = minimo;
  }

  await ingrediente.save();
  return res.json(ingrediente);
}));

router.patch('/ingredientes/:id/estado', asyncHandler(async (req, res) => {
  const ingrediente = await obtenerIngrediente(req.params.id);
  if (typeof req.body?.activo !== 'boolean') {
    throw new ApiError(400, 'activo debe ser booleano', { field: 'activo' });
  }

  if (!req.body.activo) {
    const usado = await Receta.exists({
      activa: true,
      'componentes.ingredienteId': ingrediente._id
    });
    if (usado) {
      throw new ApiError(409, 'No se puede desactivar un ingrediente usado por una receta activa');
    }
  }

  ingrediente.activo = req.body.activo;
  await ingrediente.save();
  return res.json(ingrediente);
}));

router.post('/ingredientes/:id/movimientos', asyncHandler(async (req, res) => {
  validarObjectId(req.params.id);
  const { tipo, cantidad, stockObjetivo, motivo } = req.body;
  if (!TIPOS_MOVIMIENTO_MANUAL.includes(tipo)) {
    throw new ApiError(400, 'Tipo de movimiento inválido', {
      field: 'tipo',
      allowedValues: TIPOS_MOVIMIENTO_MANUAL
    });
  }

  if ((tipo === TIPOS_MOVIMIENTO_STOCK.MERMA || tipo === TIPOS_MOVIMIENTO_STOCK.AJUSTE)
      && (!motivo || !String(motivo).trim())) {
    throw new ApiError(400, 'El motivo es obligatorio para mermas y ajustes', {
      field: 'motivo'
    });
  }

  const { movimiento, ingrediente } = await registrarMovimientoManual({
    ingredienteId: req.params.id,
    tipo,
    cantidad,
    stockObjetivo,
    motivo,
    usuarioId: req.usuario.id
  });

  await registrarAuditoria({
    accion: ACCIONES_AUDITORIA.STOCK_MOVIMIENTO_MANUAL,
    entidad: ENTIDADES_AUDITORIA.STOCK,
    entidadId: ingrediente._id,
    usuario: req.usuario,
    antes: {
      stock: movimiento.stockAnterior
    },
    despues: {
      stock: movimiento.stockPosterior
    },
    metadata: {
      ingrediente: ingrediente.nombre,
      unidad: ingrediente.unidad,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      motivo: movimiento.motivo
    }
  });

  return res.status(201).json({ movimiento, ingrediente });
}));

router.get('/movimientos', asyncHandler(async (req, res) => {
  const pagina = paginacion(req.query, 200, ['ingredienteId', 'tipo']);
  const filtro = {};
  if (req.query.ingredienteId) {
    validarObjectId(req.query.ingredienteId, 'ingredienteId');
    filtro.ingredienteId = req.query.ingredienteId;
  }

  if (req.query.tipo) {
    if (!Object.values(TIPOS_MOVIMIENTO_STOCK).includes(req.query.tipo)) {
      throw new ApiError(400, 'Tipo de movimiento inválido', { field: 'tipo' });
    }
    filtro.tipo = req.query.tipo;
  }

  const movimientos = await MovimientoStock.find(filtro)
    .populate('ingredienteId', 'nombre unidad')
    .populate('usuarioId', 'nombre')
    .sort({ fecha: -1, _id: -1 })
    .skip(pagina.skip).limit(pagina.limit);

  cabecerasPagina(res, pagina, await MovimientoStock.countDocuments(filtro));
  return res.json(movimientos);
}));

router.get('/alertas', asyncHandler(async (req, res) => {
  const ingredientes = await Ingrediente.find({ activo: true }).sort({ nombre: 1 }).lean();
  return res.json(
    ingredientes
      .filter((ingrediente) => ingrediente.stockActual <= ingrediente.stockMinimo)
      .map((ingrediente) => ({
        ...ingrediente,
        faltanteHastaMinimo: Math.max(0, ingrediente.stockMinimo - ingrediente.stockActual)
      }))
  );
}));

router.get('/recetas', asyncHandler(async (req, res) => {
  const recetas = await Receta.find()
    .populate('productoId', 'nombre categoria disponible')
    .populate('componentes.ingredienteId', 'nombre unidad activo')
    .sort({ updatedAt: -1 });

  return res.json(recetas);
}));

router.put('/recetas/:productoId', asyncHandler(async (req, res) => {
  validarObjectId(req.params.productoId, 'productoId');

  const producto = await Producto.findById(req.params.productoId);
  if (!producto) throw new ApiError(404, 'Producto no encontrado');

  const componentes = req.body?.componentes;
  if (!Array.isArray(componentes) || componentes.length === 0) {
    throw new ApiError(400, 'La receta debe contener al menos un ingrediente', {
      field: 'componentes'
    });
  }

  const ids = componentes.map((item) => item?.ingredienteId);
  if (ids.some((id) => !mongoose.isValidObjectId(id))) {
    throw new ApiError(400, 'Todos los ingredientes deben tener un ingredienteId válido', {
      field: 'componentes.ingredienteId'
    });
  }

  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ApiError(400, 'La receta no puede repetir ingredientes');
  }

  const cantidades = componentes.map((item) => Number(item?.cantidad));
  if (cantidades.some((cantidad) => !Number.isFinite(cantidad) || cantidad <= 0)) {
    throw new ApiError(400, 'Todas las cantidades de la receta deben ser mayores a cero', {
      field: 'componentes.cantidad'
    });
  }

  const ingredientes = await Ingrediente.find({
    _id: { $in: ids },
    activo: true
  });

  if (ingredientes.length !== ids.length) {
    throw new ApiError(409, 'La receta contiene ingredientes inexistentes o inactivos');
  }

  const receta = await Receta.findOneAndUpdate(
    { productoId: producto._id },
    {
      productoId: producto._id,
      componentes: componentes.map((item) => ({
        ingredienteId: item.ingredienteId,
        cantidad: Number(item.cantidad)
      })),
      activa: true
    },
    { new: true, upsert: true, runValidators: true }
  );

  return res.json(receta);
}));

router.patch('/recetas/:productoId/estado', asyncHandler(async (req, res) => {
  validarObjectId(req.params.productoId, 'productoId');
  if (typeof req.body?.activa !== 'boolean') {
    throw new ApiError(400, 'activa debe ser booleano', { field: 'activa' });
  }

  const receta = await Receta.findOne({ productoId: req.params.productoId });
  if (!receta) throw new ApiError(404, 'Receta no encontrada');

  receta.activa = req.body.activa;
  await receta.save();
  return res.json(receta);
}));

export default router;


