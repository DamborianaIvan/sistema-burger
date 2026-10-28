import express from 'express';
import mongoose from 'mongoose';
import { ROLES } from '../constants/roles.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/apiError.js';

import { paginacion, cabecerasPagina } from '../utils/paginacion.js';

const router = express.Router();

router.use(protect, restrictTo(ROLES.ADMIN));

router.get('/', asyncHandler(async (req, res) => {
  const pagina = paginacion(req.query, 100, ['accion', 'entidad', 'entidadId']);

  const filtro = {};

  if (req.query.accion) {
    if (!Object.values(ACCIONES_AUDITORIA).includes(req.query.accion)) {
      throw new ApiError(400, 'Acción de auditoría inválida', { field: 'accion' });
    }
    filtro.accion = req.query.accion;
  }

  if (req.query.entidad) {
    if (!Object.values(ENTIDADES_AUDITORIA).includes(req.query.entidad)) {
      throw new ApiError(400, 'Entidad de auditoría inválida', { field: 'entidad' });
    }
    filtro.entidad = req.query.entidad;
  }

  if (req.query.entidadId) {
    if (!mongoose.isValidObjectId(req.query.entidadId)) {
      throw new ApiError(400, 'entidadId inválido', { field: 'entidadId' });
    }
    filtro.entidadId = req.query.entidadId;
  }

  const logs = await AuditLog.find(filtro)
    .populate('usuarioId', 'nombre nombreUsuario rol')
    .sort({ fecha: -1, _id: -1 })
    .skip(pagina.skip).limit(pagina.limit)
    .lean();

  cabecerasPagina(res, pagina, await AuditLog.countDocuments(filtro));
  return res.json(logs);
}));

export default router;


