import { ApiError } from './apiError.js';

export const texto = (valor, campo, { min = 0, max = 500, trim = true } = {}) => {
  if (typeof valor !== 'string') throw new ApiError(400, `${campo} debe ser texto`, { field: campo });
  const resultado = trim ? valor.trim() : valor;
  if (resultado.length < min || resultado.length > max) {
    throw new ApiError(400, `${campo} debe tener entre ${min} y ${max} caracteres`, { field: campo });
  }
  return resultado;
};

export const validarPassword = (valor) => {
  texto(valor, 'password', { min: 8, max: 72, trim: false });
  if (Buffer.byteLength(valor, 'utf8') > 72) {
    throw new ApiError(400, 'La contraseña no puede superar 72 bytes', { field: 'password' });
  }
  return valor;
};

export const datosUsuario = (datos, parcial = false) => {
  const resultado = {};
  for (const [campo, max] of [['nombre', 100], ['nombreUsuario', 80], ['email', 254]]) {
    if (parcial && datos[campo] === undefined) continue;
    resultado[campo] = texto(datos[campo], campo, { min: 1, max });
  }
  if (resultado.email !== undefined) {
    resultado.email = resultado.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resultado.email)) {
      throw new ApiError(400, 'Email inválido', { field: 'email' });
    }
  }
  return resultado;
};

export const numero = (valor, campo, { min = 0, max = 100000000, entero = false } = {}) => {
  if (!['number', 'string'].includes(typeof valor) ||
      (typeof valor === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(valor.trim()))) {
    throw new ApiError(400, `${campo} debe ser un número válido`, { field: campo });
  }
  const resultado = Number(valor);
  if (!Number.isFinite(resultado) || resultado < min || resultado > max ||
      (entero && !Number.isSafeInteger(resultado))) {
    throw new ApiError(400, `${campo} está fuera del rango permitido`, { field: campo });
  }
  return resultado;
};

