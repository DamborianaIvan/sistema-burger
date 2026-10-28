import { createHash } from 'node:crypto';
import IntentoAcceso from '../models/IntentoAcceso.js';
import { ApiError } from '../utils/apiError.js';

const VENTANA = 15 * 60 * 1000;

export const limitarAcceso = ({ ambito, limite, clave, ventana = VENTANA }) => async (req, res, next) => {
  try {
    const ahora = Date.now();
    const inicio = Math.floor(ahora / ventana) * ventana;
    const resumen = createHash('sha256').update(String(clave(req))).digest('hex');
    const id = `${ambito}:${resumen}:${inicio}`;
    const expira = new Date(inicio + ventana);
    let intento;
    try {
      intento = await IntentoAcceso.findOneAndUpdate({ _id: id }, {
        $inc: { cantidad: 1 }, $setOnInsert: { expira }
      }, { upsert: true, new: true });
    } catch (error) {
      // Dos primeras peticiones pueden intentar crear la misma ventana a la vez.
      if (error.code !== 11000) throw error;
      intento = await IntentoAcceso.findOneAndUpdate({ _id: id }, {
        $inc: { cantidad: 1 }
      }, { new: true });
    }
    if (intento.cantidad > limite) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((expira.getTime() - ahora) / 1000)));
      return next(new ApiError(429, 'Demasiados intentos. Esperá unos minutos antes de volver a intentar'));
    }
    if (ambito === 'cuenta') req.intentoAccesoId = id;
    return next();
  } catch (error) {
    console.error('No se pudo verificar el límite de acceso:', error.message);
    return next(new ApiError(503, 'No se pudo verificar el acceso. Intentá nuevamente'));
  }
};

export const limitarLoginIp = limitarAcceso({ ambito: 'login-ip', limite: 100, clave: (req) => req.ip });
export const limitarLoginCuenta = limitarAcceso({
  ambito: 'cuenta', limite: 10, clave: (req) => req.body.nombreUsuario.toLowerCase()
});
export const limitarRegistro = limitarAcceso({ ambito: 'registro-ip', limite: 10, clave: (req) => req.ip });

export const descontarAccesoExitoso = (id) => IntentoAcceso.updateOne(
  { _id: id, cantidad: { $gt: 0 } }, { $inc: { cantidad: -1 } }
);

