import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { PERMISSIONS_VALUES, hasPermission } from '../constants/permissions.js';
import Usuario from '../models/Usuario.js';
import SesionRevocada from '../models/SesionRevocada.js';
import { ApiError } from '../utils/apiError.js';

export const protect = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Autenticación requerida', {
      reason: 'MISSING_TOKEN'
    }));
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    return next(new ApiError(401, 'Autenticación requerida', {
      reason: 'MISSING_TOKEN'
    }));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || !mongoose.isObjectIdOrHexString(payload.id) ||
        !Number.isFinite(payload.exp) || !Number.isSafeInteger(payload.sv ?? 0) || (payload.sv ?? 0) < 0) {
      throw new ApiError(401, 'Token inválido o expirado', { reason: 'INVALID_TOKEN' });
    }
    const usuario = await Usuario.findById(payload.id);

    if (!usuario || !usuario.activo) {
      return next(new ApiError(401, 'Usuario inactivo o no encontrado', {
        reason: 'INACTIVE_USER'
      }));
    }

    const hash = createHash('sha256').update(token).digest('hex');
    if ((payload.sv ?? 0) !== (usuario.versionSesion ?? 0) || await SesionRevocada.exists({ _id: hash })) {
      return next(new ApiError(401, 'La sesión ya no es válida. Iniciá sesión nuevamente', {
        reason: 'REVOKED_SESSION'
      }));
    }

    req.sesion = { hash, expira: new Date(payload.exp * 1000) };

    req.usuario = {
      id: usuario._id.toString(),
      rol: usuario.rol,
      nombre: usuario.nombre
    };

    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);

    if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
      return next(new ApiError(503, 'No se pudo verificar la sesión. Intentá nuevamente'));
    }

    return next(new ApiError(401, 'Token inválido o expirado', {
      reason: 'INVALID_TOKEN'
    }));
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return next(new ApiError(403, 'No tiene permisos para realizar esta acción', {
        reason: 'INSUFFICIENT_ROLE'
      }));
    }
    return next();
  };
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return next(new ApiError(401, 'Autenticación requerida', {
        reason: 'MISSING_AUTH_CONTEXT'
      }));
    }

    if (!PERMISSIONS_VALUES.includes(permission)) {
      return next(new ApiError(500, 'Permiso no configurado en el sistema', {
        reason: 'INVALID_PERMISSION',
        permission
      }));
    }

    if (!hasPermission(req.usuario.rol, permission)) {
      return next(new ApiError(403, 'No tiene permisos para realizar esta acción', {
        reason: 'INSUFFICIENT_PERMISSION',
        permission
      }));
    }

    return next();
  };
};


