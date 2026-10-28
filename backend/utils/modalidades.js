import { TIPOS_PEDIDO } from '../constants/pedido.js';
import { ApiError } from './apiError.js';

export const parseOrderTypes = (value = 'DELIVERY,TAKEAWAY') => {
  const tipos = [...new Set(value.split(',').map(tipo => tipo.trim().toUpperCase()))];
  if (!tipos.length || tipos.some(tipo => !Object.values(TIPOS_PEDIDO).includes(tipo))) {
    throw new Error('ORDER_TYPES debe contener modalidades válidas separadas por comas');
  }
  return tipos;
};

export const validarModalidadHabilitada = (tipo, habilitados) => {
  if (!habilitados.includes(tipo)) {
    throw new ApiError(409, 'Esta modalidad de atención no está habilitada', {
      field: 'tipoPedido', allowedValues: habilitados
    });
  }
};
