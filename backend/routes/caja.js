import { paginacion, cabecerasPagina } from '../utils/paginacion.js';
import express from 'express';
import { ESTADOS_CAJA, TIPOS_MOVIMIENTO_CAJA, crearTotalesPorMetodoVacios } from '../constants/caja.js';
import { METODOS_PAGO } from '../constants/pedido.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import Caja from '../models/Caja.js';
import MovimientoCaja from '../models/MovimientoCaja.js';
import { ApiError } from '../utils/apiError.js';
import { transaccion } from '../utils/transaccion.js';
import { numero } from '../utils/validaciones.js';
import { redondearMoneda } from '../utils/finanzasPedido.js';
import { registrarAuditoria } from '../services/auditoriaService.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../constants/auditoria.js';

const router = express.Router();

router.post('/abrir', protect, requirePermission(PERMISSIONS.CASH_OPEN), asyncHandler(async (req, res) => {
  const montoInicial = numero(req.body?.montoInicial, 'montoInicial');
  if (!Number.isFinite(montoInicial) || montoInicial < 0) {
    throw new ApiError(400, 'El monto inicial debe ser mayor o igual a cero', {
      field: 'montoInicial'
    });
  }

  const caja = await transaccion(async (session) => {
    const existente = await Caja.findOne({ estado: ESTADOS_CAJA.ABIERTA }).session(session);
    if (existente) throw new ApiError(409, 'Ya existe una caja abierta', { cajaId: existente._id });
    const [nueva] = await Caja.create([{
      estado: ESTADOS_CAJA.ABIERTA, montoInicial: redondearMoneda(montoInicial),
      abiertaPor: req.usuario.id, totalesPorMetodo: crearTotalesPorMetodoVacios()
    }], { session });
    await MovimientoCaja.create([{
      cajaId: nueva._id, tipo: TIPOS_MOVIMIENTO_CAJA.APERTURA,
      monto: nueva.montoInicial, usuarioId: req.usuario.id, fecha: nueva.fechaApertura
    }], { session });
    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.CAJA_ABIERTA,
      entidad: ENTIDADES_AUDITORIA.CAJA,
      entidadId: nueva._id,
      usuario: req.usuario,
      despues: {
        estado: nueva.estado,
        montoInicial: nueva.montoInicial,
        fechaApertura: nueva.fechaApertura
      }
    }, { session });

    return nueva;
  });

  return res.status(201).json(caja);
}));

router.get('/actual', protect, requirePermission(PERMISSIONS.CASH_CHARGE), asyncHandler(async (req, res) => {
  const caja = await Caja.findOne({ estado: ESTADOS_CAJA.ABIERTA })
    .populate('abiertaPor', 'nombre rol');

  return res.json(caja);
}));

router.get('/:id/movimientos', protect, requirePermission(PERMISSIONS.CASH_CHARGE), asyncHandler(async (req, res) => {
  const caja = await Caja.findById(req.params.id);
  if (!caja) throw new ApiError(404, 'Caja no encontrada');

  const pagina = paginacion(req.query);
  const movimientos = await MovimientoCaja.find({ cajaId: caja._id })
    .sort({ fecha: 1, _id: 1 }).skip(pagina.skip).limit(pagina.limit);
  cabecerasPagina(res, pagina, await MovimientoCaja.countDocuments({ cajaId: caja._id }));

  return res.json(movimientos);
}));

router.post('/cerrar', protect, requirePermission(PERMISSIONS.CASH_CLOSE), asyncHandler(async (req, res) => {
  const efectivoDeclarado = numero(req.body?.efectivoDeclarado, 'efectivoDeclarado');
  if (!Number.isFinite(efectivoDeclarado) || efectivoDeclarado < 0) {
    throw new ApiError(400, 'El efectivo declarado debe ser mayor o igual a cero', {
      field: 'efectivoDeclarado'
    });
  }

  const resultado = await transaccion(async (session) => {
    const caja = await Caja.findOne({ estado: ESTADOS_CAJA.ABIERTA }).session(session);
    if (!caja) throw new ApiError(409, 'No hay una caja abierta');

    const totales = crearTotalesPorMetodoVacios();
    for (const metodo of Object.values(METODOS_PAGO)) {
      totales[metodo] = redondearMoneda(caja.totalesPorMetodo?.[metodo] ?? 0);
    }

    const efectivoEsperado = redondearMoneda(
      caja.montoInicial + totales[METODOS_PAGO.EFECTIVO]
    );
    const declarado = redondearMoneda(efectivoDeclarado);

    // El cierre solo aplica si no ingresó ningún cobro desde la lectura inicial.
    // Evita cerrar con totales anteriores a un cobro concurrente.
    const filtroCierre = { _id: caja._id, estado: ESTADOS_CAJA.ABIERTA };
    for (const metodo of Object.values(METODOS_PAGO)) {
      filtroCierre[`totalesPorMetodo.${metodo}`] = caja.totalesPorMetodo[metodo];
    }
    const cerrada = await Caja.findOneAndUpdate(filtroCierre, { $set: {
      estado: ESTADOS_CAJA.CERRADA,
      fechaCierre: new Date(),
      cerradaPor: req.usuario.id,
      efectivoEsperado,
      efectivoDeclarado: declarado,
      diferencia: redondearMoneda(declarado - efectivoEsperado)
    } }, { new: true, runValidators: true, session });
    if (!cerrada) throw new ApiError(409, 'La caja recibió cambios. Actualizá los importes antes de volver a cerrar');
    Object.assign(caja, cerrada.toObject());

    await registrarAuditoria({
      accion: ACCIONES_AUDITORIA.CAJA_CERRADA,
      entidad: ENTIDADES_AUDITORIA.CAJA,
      entidadId: caja._id,
      usuario: req.usuario,
      despues: {
        estado: caja.estado,
        fechaCierre: caja.fechaCierre,
        totalesPorMetodo: caja.totalesPorMetodo,
        efectivoEsperado: caja.efectivoEsperado,
        efectivoDeclarado: caja.efectivoDeclarado,
        diferencia: caja.diferencia
      }
    }, { session });

    return caja;
  });

  return res.json(resultado);
}));

export default router;



