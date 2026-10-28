import { ApiError } from './apiError.js';
import { numero, texto } from './validaciones.js';

export const datosProducto = (datos, parcial = false) => {
  const resultado = {};
  if (!parcial || datos.nombre !== undefined) resultado.nombre = texto(datos.nombre, 'nombre', { min: 3, max: 80 });
  if (!parcial || datos.precio !== undefined) {
    resultado.precio = Math.round(numero(datos.precio, 'precio', { min: 0.01 }) * 100) / 100;
  }
  if (datos.descripcion !== undefined) resultado.descripcion = texto(datos.descripcion, 'descripcion', { max: 2000 });
  if (datos.imagen !== undefined) {
    resultado.imagen = texto(datos.imagen, 'imagen', { max: 900000 });
    if (resultado.imagen && !/^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|jpg|webp|gif);base64,)/i.test(resultado.imagen)) {
      throw new ApiError(400, 'Formato de imagen inválido', { field: 'imagen' });
    }
  }
  if (datos.disponible !== undefined) {
    if (typeof datos.disponible !== 'boolean') throw new ApiError(400, 'disponible debe ser booleano');
    resultado.disponible = datos.disponible;
  }
  return resultado;
};

export const escaparRegex = (valor) => valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const productoRequiereArchivo = ({ tienePedidos, tieneReceta }) =>
  Boolean(tienePedidos || tieneReceta);


