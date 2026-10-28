import express from 'express';
import { PERMISSIONS } from '../constants/permissions.js';
import { REPORTES } from '../constants/reportes.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { generarResumenReportes } from '../services/reportesService.js';
import { resolverRangoReportes } from '../utils/reportes.js';

const router = express.Router();

router.use(protect, requirePermission(PERMISSIONS.REPORTS_VIEW));

router.get('/resumen', asyncHandler(async (req, res) => {
  const rango = resolverRangoReportes(req.query.desde, req.query.hasta);
  const resumen = await generarResumenReportes(rango);

  return res.json({
    periodo: {
      desde: rango.desde,
      hasta: rango.hasta,
      dias: rango.dias,
      zonaHoraria: REPORTES.ZONA_HORARIA
    },
    ...resumen
  });
}));

export default router;

