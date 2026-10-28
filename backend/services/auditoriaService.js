import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/apiError.js';

const limpiarDetalle = (valor) => {
  if (Array.isArray(valor)) return valor.map(limpiarDetalle);
  if (!valor || typeof valor !== 'object' || Object.getPrototypeOf(valor) !== Object.prototype) return valor;
  return Object.fromEntries(Object.entries(valor)
    .filter(([clave, contenido]) => contenido !== undefined && !/^(password|token|authorization|jwtSecret)$/i.test(clave))
    .map(([clave, contenido]) => [clave, limpiarDetalle(contenido)]));
};

export const registrarAuditoria = async ({
  accion,
  entidad,
  entidadId = null,
  usuario = null,
  antes = null,
  despues = null,
  metadata = null,
  fecha = new Date()
}, { session = null } = {}) => {
  try {
    const datos = {
      accion,
      entidad,
      entidadId,
      usuarioId: usuario?.id ?? null,
      usuarioNombreSnapshot: usuario?.nombre ?? null,
      antes: limpiarDetalle(antes),
      despues: limpiarDetalle(despues),
      metadata: limpiarDetalle(metadata),
      fecha
    };
    if (session) {
      const [log] = await AuditLog.create([datos], { session });
      return log;
    }
    return await AuditLog.create(datos);
  } catch (error) {
    console.error('No se pudo registrar auditoría:', error.name);
    if (session) throw new ApiError(503, 'No se pudo registrar la operación. Intentá nuevamente', { reason: 'AUDIT_UNAVAILABLE' });
    return null;
  }
};


