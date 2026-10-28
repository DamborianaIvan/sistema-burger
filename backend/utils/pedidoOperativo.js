import { ROLES } from '../constants/roles.js';

// Lista permitida explícita: un nuevo campo del modelo no se filtra automáticamente.
export const pedidoOperativo = (documento, rol) => {
  const p = documento.toObject ? documento.toObject() : documento;
  if (![ROLES.CHEF, ROLES.DELIVERY].includes(rol)) return p;
  const resultado = {
    _id: p._id, tipoPedido: p.tipoPedido, estadoPedido: p.estadoPedido,
    fechaPedido: p.fechaPedido, comentario: p.comentario,
    productos: p.productos.map((item) => ({
      productoId: item.productoId, nombreSnapshot: item.nombreSnapshot,
      ...(rol === ROLES.CHEF ? { categoriaSnapshot: item.categoriaSnapshot ?? null } : {}),
      cantidad: item.cantidad
    }))
  };
  if (rol === ROLES.CHEF) {
    resultado.mesaId = p.mesaId && typeof p.mesaId === 'object' && p.mesaId.numero !== undefined
      ? { _id: p.mesaId._id, numero: p.mesaId.numero, nombre: p.mesaId.nombre }
      : p.mesaId;
  } else {
    resultado.nombreCliente = p.nombreCliente;
    resultado.telefono = p.telefono;
    resultado.direccion = p.direccion;
  }
  return resultado;
};


