import { ApiError } from './apiError.js';

export const paginacion = (query, defecto = 50, filtros = []) => {
  const permitidos = new Set(['page', 'limit', ...filtros]);
  if (Object.keys(query).some((clave) => !permitidos.has(clave))) throw new ApiError(400, 'Parámetro de consulta inválido');
  const entero = (valor, nombre, max) => {
    if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) throw new ApiError(400, `${nombre} debe ser un entero positivo`);
    const n = Number(valor);
    if (!Number.isSafeInteger(n) || n > max) throw new ApiError(400, `${nombre} supera el máximo permitido`);
    return n;
  };
  const page = query.page === undefined ? 1 : entero(query.page, 'page', 10000);
  const limit = query.limit === undefined ? defecto : entero(query.limit, 'limit', 200);
  const skip = (page - 1) * limit;
  if (skip > 100000) throw new ApiError(400, 'Acotá la búsqueda por fecha para consultar registros antiguos');
  return { page, limit, skip };
};

export const cabecerasPagina = (res, { page, limit }, total) => {
  res.setHeader('X-Total-Count', total);
  res.setHeader('X-Page', page);
  res.setHeader('X-Limit', limit);
  res.setHeader('X-Has-More', page * limit < total ? 'true' : 'false');
};

