import { ApiError } from '../utils/apiError.js';

export const requestBody = (req, res, next) => {
  if (req.body !== undefined && (
    !req.body || typeof req.body !== 'object' || Array.isArray(req.body)
  )) {
    return next(new ApiError(400, 'El cuerpo de la petición debe ser un objeto JSON'));
  }
  req.body ??= {};
  return next();
};

